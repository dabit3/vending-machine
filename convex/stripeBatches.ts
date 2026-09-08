import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdmin } from "./admins";
import {
  attachBatchToEvent,
  batchOperatorExists,
  batchSummary,
  requireBatchCapacity,
  RETRY_WINDOW_MS,
  startBatch,
} from "./stripeBatchModel";
import { generationFields, stripeMode } from "./stripeValidation";

const jobArgs = { batchId: v.id("stripeBatches"), version: v.number() };

export const configuration = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return stripeMode();
  },
});

export const list = query({
  args: { eventId: v.optional(v.id("events")) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const batches = args.eventId
      ? await ctx.db
          .query("stripeBatches")
          .withIndex("by_target_event", (q) =>
            q.eq("targetEventId", args.eventId),
          )
          .order("desc")
          .take(100)
      : await ctx.db.query("stripeBatches").order("desc").take(100);
    return batches.map(batchSummary);
  },
});

export type BatchLibraryFilter = "all" | "available" | "assigned" | "attention";

export const history = query({
  args: {
    paginationOpts: paginationOptsValidator,
    filter: v.optional(
      v.union(
        v.literal("all"),
        v.literal("available"),
        v.literal("assigned"),
        v.literal("attention"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    let batches = ctx.db.query("stripeBatches").order("desc");
    if (args.filter === "available") {
      batches = batches.filter((q) =>
        q.and(
          q.eq(q.field("status"), "complete"),
          q.eq(q.field("eventId"), undefined),
          q.or(
            q.eq(q.field("expiresAt"), undefined),
            q.gt(q.field("expiresAt"), Date.now()),
          ),
        ),
      );
    } else if (args.filter === "assigned") {
      batches = batches.filter((q) => q.neq(q.field("eventId"), undefined));
    } else if (args.filter === "attention") {
      batches = batches.filter((q) =>
        q.or(
          q.eq(q.field("status"), "failed"),
          q.neq(q.field("error"), undefined),
        ),
      );
    }
    const result = await batches.paginate({
      ...args.paginationOpts,
      numItems: Math.min(args.paginationOpts.numItems, 100),
    });
    const page = await Promise.all(
      result.page.map(async (batch) => {
        const eventId = batch.eventId ?? batch.targetEventId;
        const event = eventId ? await ctx.db.get(eventId) : null;
        return { ...batchSummary(batch), eventName: event?.name ?? null };
      }),
    );
    return { ...result, page };
  },
});

export const get = query({
  args: { batchId: v.id("stripeBatches") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const batch = await ctx.db.get(args.batchId);
    if (!batch) return null;
    const eventId = batch.eventId ?? batch.targetEventId;
    const event = eventId ? await ctx.db.get(eventId) : null;
    return {
      ...batchSummary(batch),
      codes: batch.codes,
      eventName: event?.name ?? null,
    };
  },
});

export const create = mutation({
  args: {
    ...generationFields,
    eventId: v.optional(v.id("events")),
    codeType: v.optional(v.string()),
  },
  handler: async (ctx, args) =>
    startBatch(ctx, args, args.eventId, args.codeType),
});

export const attach = mutation({
  args: {
    batchId: v.id("stripeBatches"),
    eventId: v.id("events"),
    codeType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new ConvexError("Batch not found.");
    const error = await attachBatchToEvent(
      ctx,
      batch,
      args.eventId,
      identity.email!.trim().toLowerCase(),
      args.codeType,
    );
    if (error) throw new ConvexError(error);
  },
});

export const retry = mutation({
  args: { batchId: v.id("stripeBatches"), confirmLive: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new ConvexError("Batch not found.");
    if (batch.status !== "failed")
      throw new ConvexError("Only failed batches can be retried.");
    if (batch.createdBy !== identity.email!.trim().toLowerCase())
      throw new ConvexError(
        "Only the original system admin can resume this batch.",
      );
    if (
      batch.startedAt !== undefined &&
      Date.now() - batch.startedAt >= RETRY_WINDOW_MS
    ) {
      throw new ConvexError(
        "The safe retry window has ended. Reconcile this batch in Stripe before creating a new batch.",
      );
    }
    if (batch.expiresAt !== undefined && batch.expiresAt <= Date.now())
      throw new ConvexError("This batch has expired.");
    const mode = stripeMode();
    if (!mode.configured || mode.live !== batch.live)
      throw new ConvexError(
        "The Stripe configuration no longer matches this batch.",
      );
    if (batch.live && !args.confirmLive)
      throw new ConvexError("Confirm live-mode code creation before retrying.");
    await requireBatchCapacity(ctx);
    const version = batch.version + 1;
    await ctx.db.patch(batch._id, {
      status: "queued",
      version,
      error: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.stripeWorker.generate, {
      batchId: batch._id,
      version,
    });
  },
});

export const begin = internalMutation({
  args: { ...jobArgs, seed: v.string(), keyFingerprint: v.string() },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch || batch.version !== args.version || batch.status !== "queued")
      return null;
    const mode = stripeMode();
    const error = !(await batchOperatorExists(ctx, batch.createdBy))
      ? "The requesting admin no longer has system access. Generation stopped."
      : !mode.configured ||
          mode.live !== batch.live ||
          (batch.keyFingerprint && batch.keyFingerprint !== args.keyFingerprint)
        ? "Stripe configuration changed. Restore the original configuration before retrying."
        : batch.startedAt !== undefined &&
            Date.now() - batch.startedAt >= RETRY_WINDOW_MS
          ? "The safe retry window has ended. Reconcile this batch in Stripe."
          : batch.expiresAt !== undefined && batch.expiresAt <= Date.now()
            ? "This batch has expired. Generation stopped."
            : null;
    if (error) {
      await ctx.db.patch(batch._id, { status: "failed", error });
      return null;
    }
    await ctx.db.patch(batch._id, {
      status: "running",
      seed: batch.seed ?? args.seed,
      keyFingerprint: batch.keyFingerprint ?? args.keyFingerprint,
      startedAt: batch.startedAt ?? Date.now(),
    });
    await ctx.scheduler.runAfter(300_000, internal.stripeBatches.fail, {
      batchId: batch._id,
      version: args.version,
      error:
        "Generation was interrupted. Saved codes are safe; retry to resume this batch.",
    });
    return await ctx.db.get(batch._id);
  },
});

export const authorized = internalQuery({
  args: jobArgs,
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    return (
      !!batch &&
      batch.version === args.version &&
      batch.status === "running" &&
      (await batchOperatorExists(ctx, batch.createdBy))
    );
  },
});

export const saveCoupon = internalMutation({
  args: { ...jobArgs, couponId: v.string() },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch || batch.version !== args.version || batch.status !== "running")
      throw new ConvexError("Batch is no longer running.");
    if (batch.couponId && batch.couponId !== args.couponId)
      throw new ConvexError("Coupon mismatch.");
    await ctx.db.patch(batch._id, { couponId: args.couponId });
  },
});

export const recordCode = internalMutation({
  args: { ...jobArgs, index: v.number(), id: v.string(), code: v.string() },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch || batch.version !== args.version || batch.status !== "running")
      throw new ConvexError("Batch is no longer running.");
    if (batch.codes[args.index]?.id === args.id) return;
    if (
      batch.codes.length !== args.index ||
      args.index >= batch.quantity ||
      batch.codes.some((code) => code.code === args.code)
    ) {
      throw new ConvexError("Invalid code checkpoint.");
    }
    await ctx.db.patch(batch._id, {
      codes: [...batch.codes, { id: args.id, code: args.code }],
    });
  },
});

export const checkpoint = internalMutation({
  args: jobArgs,
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch || batch.version !== args.version || batch.status !== "running")
      return;
    const codes = batch.codes;
    const complete = codes.length === batch.quantity;
    const version = batch.version + 1;
    await ctx.db.patch(batch._id, {
      codes,
      status: complete ? "complete" : "queued",
      version,
      error: undefined,
    });
    if (complete && batch.targetEventId) {
      const error = (await batchOperatorExists(ctx, batch.createdBy))
        ? await attachBatchToEvent(
            ctx,
            { ...batch, codes, status: "complete" },
            batch.targetEventId,
            batch.createdBy,
            batch.codeType,
          )
        : "Codes saved, but not added to the event: the requesting admin no longer has system access.";
      if (error) await ctx.db.patch(batch._id, { error });
    }
    if (!complete)
      await ctx.scheduler.runAfter(0, internal.stripeWorker.generate, {
        batchId: batch._id,
        version,
      });
  },
});

export const fail = internalMutation({
  args: { ...jobArgs, error: v.string() },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (batch?.version === args.version && batch.status === "running") {
      const error = batch.couponId && batch.codes.length === batch.quantity
        ? "All codes are saved, but the batch could not be finalized. Resume this batch to finish without creating new codes."
        : args.error;
      await ctx.db.patch(batch._id, { status: "failed", error });
    }
  },
});
