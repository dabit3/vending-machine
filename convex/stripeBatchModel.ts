import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireAdmin } from "./admins";
import { blockKey } from "./blockValues";
import { logAudit } from "./auditLog";
import { validateGeneration, type GenerationInput } from "./stripeValidation";
import { generateStripeCodePrefix } from "../lib/stripe-name";

export const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

export async function batchOperatorExists(
  ctx: QueryCtx | MutationCtx,
  email: string,
) {
  return (
    (await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique()) !== null
  );
}

export async function requireBatchCapacity(ctx: MutationCtx) {
  const active = await Promise.all(
    (["queued", "running"] as const).map((status) =>
      ctx.db
        .query("stripeBatches")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(3),
    ),
  );
  if (active.flat().length >= 3)
    throw new ConvexError(
      "Three batches are already in progress. Wait for one to finish.",
    );
}

export async function startBatch(
  ctx: MutationCtx,
  input: GenerationInput,
  targetEventId?: Id<"events">,
  codeType?: string,
) {
  const identity = await requireAdmin(ctx);
  const createdBy = identity.email!.trim().toLowerCase();
  const values = validateGeneration(input);
  const requestFingerprint = JSON.stringify({
    ...values,
    targetEventId,
    codeType: codeType?.trim(),
  });
  const existing = await ctx.db
    .query("stripeBatches")
    .withIndex("by_creator_request", (q) =>
      q.eq("createdBy", createdBy).eq("requestId", input.requestId),
    )
    .unique();
  if (existing) {
    if (existing.requestFingerprint !== requestFingerprint) {
      throw new ConvexError(
        "This request ID was already used for another batch.",
      );
    }
    return existing._id;
  }
  if (targetEventId) {
    const destination = await resolveDestination(
      ctx,
      targetEventId,
      values,
      codeType,
    );
    if (destination.error) throw new ConvexError(destination.error);
  }
  if (codeType && codeType.trim().length > 80)
    throw new ConvexError("Block names must be 80 characters or fewer.");
  const recent = await ctx.db
    .query("stripeBatches")
    .withIndex("by_creator", (q) =>
      q.eq("createdBy", createdBy).gte("_creationTime", Date.now() - 60_000),
    )
    .take(5);
  if (recent.length >= 5)
    throw new ConvexError("Wait a minute before creating another batch.");
  await requireBatchCapacity(ctx);
  const batchId = await ctx.db.insert("stripeBatches", {
    ...values,
    prefix: values.prefix || generateStripeCodePrefix(),
    createdBy,
    requestId: input.requestId,
    requestFingerprint,
    status: "queued",
    version: 0,
    codes: [],
    targetEventId,
    codeType: codeType?.trim(),
  });
  await ctx.scheduler.runAfter(0, internal.stripeWorker.generate, {
    batchId,
    version: 0,
  });
  return batchId;
}

async function resolveDestination(
  ctx: MutationCtx,
  eventId: Id<"events">,
  batch: { name: string; amountCents: number },
  requestedType?: string,
) {
  const event = await ctx.db.get(eventId);
  if (!event)
    return {
      error: "Event not found. The codes remain saved in Code studio.",
    } as const;
  const codeType = requestedType?.trim() ?? batch.name;
  if (codeType.length > 80)
    return { error: "Block names must be 80 characters or fewer." } as const;
  const existing = await ctx.db
    .query("codes")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  const types = [...new Set(existing.map((code) => code.codeType ?? ""))];
  if (!types.includes(codeType)) types.push(codeType);
  if (types.length > 2)
    return {
      error: "This event already has two blocks. Choose an existing block.",
    } as const;
  if (types.length === 2 && types.includes(""))
    return {
      error: "Name the existing unnamed block before adding a second block.",
    } as const;
  const value = String(batch.amountCents / 100);
  const oldValue = event.codeTypeValues?.[blockKey(codeType)];
  if (oldValue && oldValue !== value)
    return {
      error:
        "This block has a different value. Use a separate block for this batch.",
    } as const;
  return { error: null, event, codeType, existing, types, value } as const;
}

export async function attachBatchToEvent(
  ctx: MutationCtx,
  batch: Doc<"stripeBatches">,
  eventId: Id<"events">,
  actorEmail: string,
  requestedType?: string,
): Promise<string | null> {
  if (batch.eventId)
    return batch.eventId === eventId
      ? null
      : "This batch is already assigned to another event.";
  if (batch.status !== "complete" || batch.codes.length !== batch.quantity)
    return "Wait for the entire batch to finish.";
  if (batch.expiresAt !== undefined && batch.expiresAt <= Date.now())
    return "This batch has expired.";
  const destination = await resolveDestination(
    ctx,
    eventId,
    batch,
    requestedType,
  );
  if (destination.error !== null) return destination.error;
  const { event, codeType, existing, types, value } = destination;
  const existingCodes = new Set(existing.map((code) => code.code));
  if (batch.codes.some((code) => existingCodes.has(code.code)))
    return "Some codes are already in this event. No codes were added.";
  for (const code of batch.codes) {
    await ctx.db.insert("codes", {
      eventId,
      code: code.code,
      codeType: codeType || undefined,
      expiresAt: batch.expiresAt,
    });
  }
  await ctx.db.patch(eventId, {
    codeTypes: types,
    codeTypeValues: {
      ...(event.codeTypeValues ?? {}),
      [blockKey(codeType)]: value,
    },
  });
  await ctx.db.patch(batch._id, {
    eventId,
    targetEventId: eventId,
    codeType,
    attachedBy: actorEmail,
    attachedAt: Date.now(),
    error: undefined,
  });
  await logAudit(ctx, {
    eventId,
    action: "stripe_batch_attached",
    actorEmail,
    details: `Added ${batch.quantity} ${batch.live ? "live" : "test"} Stripe codes from batch ${batch._id}`,
  });
  return null;
}

export function batchSummary(batch: Doc<"stripeBatches">) {
  return {
    _id: batch._id,
    _creationTime: batch._creationTime,
    name: batch.name,
    prefix: batch.prefix,
    amountCents: batch.amountCents,
    quantity: batch.quantity,
    expiresAt: batch.expiresAt,
    live: batch.live,
    createdBy: batch.createdBy,
    status: batch.status,
    generatedCount: batch.codes.length,
    couponId: batch.couponId,
    error: batch.error,
    eventId: batch.eventId,
    targetEventId: batch.targetEventId,
    codeType: batch.codeType,
    expired: batch.expiresAt !== undefined && batch.expiresAt <= Date.now(),
    canRetry:
      batch.status === "failed" &&
      (batch.startedAt === undefined ||
        Date.now() - batch.startedAt < RETRY_WINDOW_MS),
  };
}
