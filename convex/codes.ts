import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { adminEmailStatus, requireAdmin, requireEventAdmin } from "./admins";
import { viewerIdentityKeys } from "./identity";
import { logAudit } from "./auditLog";
import {
  activeCodeTypes,
  blockKey,
  blockValue,
  isArchivedType,
} from "./blockValues";
import { codeTerms as termsOf } from "./codeTerms";
import { stripeMode } from "./stripeValidation";

// Drop the type from the event's denormalized list when its last code is
// removed.
export async function dropTypeIfEmpty(
  ctx: MutationCtx,
  eventId: Id<"events">,
  codeType: string | undefined
) {
  const remaining = await ctx.db
    .query("codes")
    .withIndex("by_event_codeType_claimedBy", (q) =>
      q.eq("eventId", eventId).eq("codeType", codeType)
    )
    .first();
  if (!remaining) {
    const event = await ctx.db.get(eventId);
    const typeKey = codeType ?? "";
    if (event?.codeTypes?.includes(typeKey)) {
      const values = { ...(event.codeTypeValues ?? {}) };
      delete values[blockKey(typeKey)];
      await ctx.db.patch(eventId, {
        codeTypes: event.codeTypes.filter((t) => t !== typeKey),
        codeTypeValues: values,
        archivedCodeTypes: event.archivedCodeTypes?.filter(
          (t) => t !== typeKey
        ),
      });
    }
  }
}

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    return await ctx.db
      .query("codes")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
  },
});

// Codes from attached Stripe batches that each redeem twice. Matched by code
// string so the result survives block renames.
export const multiUseCodes = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    const batches = await ctx.db
      .query("stripeBatches")
      .withIndex("by_target_event", (q) => q.eq("targetEventId", args.eventId))
      .collect();
    return batches
      .filter((b) => b.eventId === args.eventId && b.redemptionsPerCode === 2)
      .flatMap((b) => b.codes.map((c) => c.code));
  },
});

// Per-code terms for attached Stripe batches whose codes redeem twice or
// repeat monthly. Codes absent from the result redeem once for one invoice.
export const codeTerms = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    const batches = await ctx.db
      .query("stripeBatches")
      .withIndex("by_target_event", (q) => q.eq("targetEventId", args.eventId))
      .collect();
    return batches
      .filter(
        (b) =>
          b.eventId === args.eventId &&
          ((b.redemptionsPerCode ?? 1) > 1 || (b.durationMonths ?? 1) > 1)
      )
      .flatMap((b) =>
        b.codes.map((c) => ({
          code: c.code,
          redemptions: b.redemptionsPerCode ?? 1,
          months: b.durationMonths ?? 1,
        }))
      );
  },
});

// Adds codes to one of an event's blocks, creating the block when needed.
// Shared by the manage page and event creation.
export async function addCodesToEvent(
  ctx: MutationCtx,
  eventId: Id<"events">,
  input: { codes: string[]; codeType?: string; value?: string }
) {
  const event = await ctx.db.get(eventId);
  if (!event) throw new Error("Event not found");
  const codeType = input.codeType?.trim() || undefined;
  if (isArchivedType(event, codeType)) {
    throw new Error(
      "This code block is archived. Unarchive it before adding codes."
    );
  }
  const existing = await ctx.db
    .query("codes")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  // Events support at most two code types, and both must be named so
  // attendees can tell them apart on the claim page.
  const ordered = [...activeCodeTypes(event, existing)];
  const resultingTypes = new Set(ordered);
  resultingTypes.add(codeType ?? "");
  if (resultingTypes.size > 2) {
    throw new Error("An event can have at most two code types.");
  }
  if (resultingTypes.size === 2 && resultingTypes.has("")) {
    throw new Error(
      "Both code blocks need a name so attendees can tell them apart. Name the existing block (next to its badge above the form), then add the new block."
    );
  }
  const existingSet = new Set(existing.map((c) => c.code));
  let added = 0;
  let skipped = 0;
  for (const raw of input.codes) {
    const code = raw.trim();
    if (!code || existingSet.has(code)) {
      skipped++;
      continue;
    }
    existingSet.add(code);
    await ctx.db.insert("codes", { eventId, code, codeType });
    added++;
  }
  // Keep the event's denormalized type list in sync so availability checks
  // can probe per type instead of scanning the pool. Types are ordered by
  // when each block was first created, not alphabetically.
  if (added > 0) {
    if (!ordered.includes(codeType ?? "")) ordered.push(codeType ?? "");
    await ctx.db.patch(eventId, { codeTypes: ordered });
    const value = input.value?.trim();
    if (value) {
      await ctx.db.patch(eventId, {
        codeTypeValues: {
          ...(event.codeTypeValues ?? {}),
          [blockKey(codeType)]: value,
        },
      });
    }
  }
  return { added, skipped };
}

export const add = mutation({
  args: {
    eventId: v.id("events"),
    codes: v.array(v.string()),
    codeType: v.optional(v.string()),
    value: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    return await addCodesToEvent(ctx, args.eventId, args);
  },
});

// Sets or clears the free-text value shown for a code block.
export const setTypeValue = mutation({
  args: {
    eventId: v.id("events"),
    codeType: v.optional(v.string()),
    value: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    const key = blockKey(args.codeType?.trim() || "");
    const value = args.value?.trim();
    const values = { ...(event.codeTypeValues ?? {}) };
    if (value) {
      values[key] = value;
    } else {
      delete values[key];
    }
    await ctx.db.patch(args.eventId, { codeTypeValues: values });
  },
});

export const renameType = mutation({
  args: {
    eventId: v.id("events"),
    from: v.optional(v.string()),
    to: v.string(),
  },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    const to = args.to.trim();
    if (!to) {
      throw new Error("Enter a name for the code block.");
    }
    const from = args.from?.trim() || undefined;
    const targets = await ctx.db
      .query("codes")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .filter((q) => q.eq(q.field("codeType"), from))
      .collect();
    for (const code of targets) {
      await ctx.db.patch(code._id, { codeType: to });
    }
    const event = await ctx.db.get(args.eventId);
    // Rename in place so the block keeps its creation-order position.
    const ordered = (event?.codeTypes ?? []).map((t) =>
      t === (from ?? "") && targets.length > 0 ? to : t
    );
    // Legacy events may have no stored type list; ensure the new name lands.
    if (targets.length > 0 && !ordered.includes(to)) ordered.push(to);
    const codeTypes = [...new Set(ordered)].filter(
      (t) => targets.length > 0 || t !== (from ?? "")
    );
    // Carry the block's value over to its new name.
    const values = { ...(event?.codeTypeValues ?? {}) };
    const fromKey = blockKey(from);
    const toKey = blockKey(to);
    if (targets.length > 0 && fromKey in values && !(toKey in values)) {
      values[toKey] = values[fromKey];
    }
    if (fromKey !== toKey) delete values[fromKey];
    const archivedCodeTypes = event?.archivedCodeTypes?.map((t) =>
      t === (from ?? "") && targets.length > 0 ? to : t
    );
    await ctx.db.patch(args.eventId, {
      codeTypes,
      codeTypeValues: values,
      archivedCodeTypes,
    });
    return { renamed: targets.length };
  },
});

// Deletes an entire code block: its unclaimed codes plus the block's name
// on the event. Claimed codes are kept so attendees keep their claim status
// and receipts; the block's stored value also stays so those receipts keep
// showing it. Deleting the last block leaves the event with no codes, like a
// freshly created event.
export const removeType = mutation({
  args: { eventId: v.id("events"), codeType: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actorEmail = await requireEventAdmin(ctx, args.eventId);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    const codeType = args.codeType?.trim() || undefined;
    const typeKey = codeType ?? "";
    const codes = await ctx.db
      .query("codes")
      .withIndex("by_event_codeType_claimedBy", (q) =>
        q.eq("eventId", args.eventId).eq("codeType", codeType)
      )
      .collect();
    // Legacy events may lack the denormalized type list, so a block also
    // counts as present when codes carry its type.
    if (!event.codeTypes?.includes(typeKey) && codes.length === 0) {
      throw new Error("This event has no such code block.");
    }
    let removed = 0;
    let kept = 0;
    for (const code of codes) {
      if (code.claimedBy) {
        kept++;
        continue;
      }
      await ctx.db.delete(code._id);
      removed++;
    }
    const values = { ...(event.codeTypeValues ?? {}) };
    if (kept === 0) delete values[blockKey(typeKey)];
    await ctx.db.patch(args.eventId, {
      codeTypes: (event.codeTypes ?? []).filter((t) => t !== typeKey),
      codeTypeValues: values,
      archivedCodeTypes: event.archivedCodeTypes?.filter((t) => t !== typeKey),
    });
    await logAudit(ctx, {
      eventId: args.eventId,
      action: "code_block_deleted",
      actorEmail: actorEmail ?? undefined,
      details: `Deleted block "${typeKey}": ${removed} unclaimed code(s) removed, ${kept} claimed code(s) kept`,
    });
    return { removed, kept };
  },
});

// Archives or unarchives a code block. An archived block keeps every code
// (claimed and unclaimed) for records and receipts, but dispenses nothing
// until it is unarchived, so an event can be closed off once it is over.
// System admins only.
export const setTypeArchived = mutation({
  args: {
    eventId: v.id("events"),
    codeType: v.optional(v.string()),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { email: actorEmail } = await adminEmailStatus(ctx);
    await requireAdmin(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    const codeType = args.codeType?.trim() || undefined;
    const typeKey = codeType ?? "";
    const codes = await ctx.db
      .query("codes")
      .withIndex("by_event_codeType_claimedBy", (q) =>
        q.eq("eventId", args.eventId).eq("codeType", codeType)
      )
      .collect();
    if (!event.codeTypes?.includes(typeKey) && codes.length === 0) {
      throw new Error("This event has no such code block.");
    }
    const current = event.archivedCodeTypes ?? [];
    const archivedCodeTypes = args.archived
      ? [...new Set([...current, typeKey])]
      : current.filter((t) => t !== typeKey);
    const unclaimed = codes.filter((c) => c.claimedBy === undefined).length;
    let stripeCodes = 0;
    if (args.archived !== current.includes(typeKey)) {
      await ctx.db.patch(args.eventId, { archivedCodeTypes });
      await logAudit(ctx, {
        eventId: args.eventId,
        action: args.archived ? "code_block_archived" : "code_block_unarchived",
        actorEmail: actorEmail ?? undefined,
        details: args.archived
          ? `Archived block "${typeKey}": ${unclaimed} unclaimed code(s) held back, ${codes.length - unclaimed} claimed code(s) kept`
          : `Unarchived block "${typeKey}": ${unclaimed} unclaimed code(s) available again`,
      });
      stripeCodes = await startStripeSync(ctx, event, codeType, codes, !args.archived);
    }
    return { unclaimed, claimed: codes.length - unclaimed, stripeCodes };
  },
});

// Codes generated through Code studio, sorted so the worker can page through
// them by code without skipping any when rows are deleted mid-sync.
function stripeLinkedCodes(codes: Doc<"codes">[]) {
  return codes
    .filter((c) => c.stripeBatchId !== undefined)
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

// Mirrors the block's archive state onto its Stripe promotion codes
// (active = !archived) through a background worker. Returns how many codes
// the worker will update. Pasted codes have no Stripe record and are skipped.
async function startStripeSync(
  ctx: MutationCtx,
  event: Doc<"events">,
  codeType: string | undefined,
  codes: Doc<"codes">[],
  active: boolean
) {
  const linked = stripeLinkedCodes(codes);
  if (linked.length === 0) return 0;
  const key = blockKey(codeType);
  const version = (event.stripeArchiveSync?.[key]?.version ?? 0) + 1;
  const configured = stripeMode().configured;
  await ctx.db.patch(event._id, {
    stripeArchiveSync: {
      ...(event.stripeArchiveSync ?? {}),
      [key]: {
        version,
        active,
        status: configured ? "pending" : "failed",
        total: linked.length,
        updated: 0,
        failed: configured ? 0 : linked.length,
        ...(configured
          ? {}
          : { error: "Stripe is not configured on this deployment." }),
        at: Date.now(),
      },
    },
  });
  if (configured) {
    await ctx.scheduler.runAfter(0, internal.stripeWorker.setBlockActive, {
      eventId: event._id,
      codeType,
      version,
      count: true,
    });
  }
  return linked.length;
}

export const retryStripeSync = mutation({
  args: { eventId: v.id("events"), codeType: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    const codeType = args.codeType?.trim() || undefined;
    const codes = await ctx.db
      .query("codes")
      .withIndex("by_event_codeType_claimedBy", (q) =>
        q.eq("eventId", args.eventId).eq("codeType", codeType)
      )
      .collect();
    return {
      stripeCodes: await startStripeSync(
        ctx,
        event,
        codeType,
        codes,
        !isArchivedType(event, codeType)
      ),
    };
  },
});

export const stripeSyncChunk = internalQuery({
  args: {
    eventId: v.id("events"),
    codeType: v.optional(v.string()),
    version: v.number(),
    after: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    const sync = event?.stripeArchiveSync?.[blockKey(args.codeType)];
    if (!event || !sync || sync.version !== args.version) return null;
    const codes = await ctx.db
      .query("codes")
      .withIndex("by_event_codeType_claimedBy", (q) =>
        q.eq("eventId", args.eventId).eq("codeType", args.codeType)
      )
      .collect();
    const remaining = stripeLinkedCodes(codes).filter(
      (c) => args.after === undefined || c.code > args.after
    );
    const batches = new Map<Id<"stripeBatches">, Doc<"stripeBatches"> | null>();
    const items: { code: string; promoId: string | null; live: boolean | null }[] =
      [];
    for (const code of remaining.slice(0, args.limit)) {
      const batchId = code.stripeBatchId;
      if (!batchId) continue;
      if (!batches.has(batchId)) batches.set(batchId, await ctx.db.get(batchId));
      const batch = batches.get(batchId);
      items.push({
        code: code.code,
        promoId: batch?.codes.find((b) => b.code === code.code)?.id ?? null,
        live: batch?.live ?? null,
      });
    }
    return { active: sync.active, items, done: remaining.length <= args.limit };
  },
});

export const stripeSyncProgress = internalMutation({
  args: {
    eventId: v.id("events"),
    codeType: v.optional(v.string()),
    version: v.number(),
    updated: v.number(),
    failed: v.number(),
    error: v.optional(v.string()),
    done: v.boolean(),
    // False for a repair pass re-applying the current state after a stale
    // worker; it fixes Stripe but leaves the counters alone.
    count: v.boolean(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    const key = blockKey(args.codeType);
    const sync = event?.stripeArchiveSync?.[key];
    if (!event || !sync) return null;
    if (sync.version !== args.version)
      return { superseded: true, version: sync.version };
    if (!args.count) return { superseded: false, version: sync.version };
    const updated = sync.updated + args.updated;
    const failed = sync.failed + args.failed;
    const error = sync.error ?? args.error;
    await ctx.db.patch(args.eventId, {
      stripeArchiveSync: {
        ...event.stripeArchiveSync,
        [key]: {
          ...sync,
          updated,
          failed,
          ...(error !== undefined ? { error } : {}),
          status: !args.done
            ? "pending"
            : failed > 0 || error !== undefined
              ? "failed"
              : "done",
          at: Date.now(),
        },
      },
    });
    if (args.done) {
      const verb = sync.active ? "reactivated" : "deactivated";
      await logAudit(ctx, {
        eventId: args.eventId,
        action: sync.active
          ? "stripe_codes_reactivated"
          : "stripe_codes_deactivated",
        details:
          `${updated} of ${sync.total} Stripe promotion code(s) in block "${key}" ${verb}` +
          (failed > 0 || error !== undefined
            ? `, ${failed} failed${error ? `: ${error}` : ""}`
            : ""),
      });
    }
    return { superseded: false, version: sync.version };
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const keys = await viewerIdentityKeys(ctx);
    if (keys.length === 0) return null;

    const claimed: Doc<"codes">[] = [];
    for (const key of keys) {
      claimed.push(
        ...(await ctx.db
          .query("codes")
          .withIndex("by_claimedBy", (q) => q.eq("claimedBy", key))
          .collect())
      );
    }
    const items = await Promise.all(
      claimed.map(async (c) => {
        const event = await ctx.db.get(c.eventId);
        return {
          _id: c._id,
          code: c.code,
          codeType: c.codeType,
          claimedAt: c.claimedAt,
          expiresAt: c.expiresAt,
          terms: await termsOf(ctx, c),
          event: event
            ? {
                _id: event._id,
                name: event.name,
                slug: event.slug,
                creditAmount: blockValue(event, c.codeType),
                eventDate: event.eventDate,
                eventEndDate: event.eventEndDate,
              }
            : null,
        };
      })
    );
    return items.sort((a, b) => (b.claimedAt ?? 0) - (a.claimedAt ?? 0));
  },
});

export const remove = mutation({
  args: { id: v.id("codes") },
  handler: async (ctx, args) => {
    const code = await ctx.db.get(args.id);
    if (!code) return;
    await requireEventAdmin(ctx, code.eventId);
    if (code.claimedBy) {
      throw new Error(
        `Cannot remove ${code.code}. It was already dispensed to ${code.claimedBy}. Deleting it would let them claim a second code.`
      );
    }
    await ctx.db.delete(args.id);
    await dropTypeIfEmpty(ctx, code.eventId, code.codeType);
  },
});

// Admin action: takes a dispensed code back from its claimant and returns it
// to the pool, e.g. when they won't use it. The claim no longer counts
// toward their cross-event limit.
export const release = mutation({
  // `claimedBy` is the claimant the admin confirmed, so a confirmation left
  // open while the code changed hands cannot take it from someone else.
  args: { id: v.id("codes"), claimedBy: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const code = await ctx.db.get(args.id);
    if (!code) throw new Error("Code not found");
    const actorEmail = await requireEventAdmin(ctx, code.eventId);
    if (!code.claimedBy) return { released: false as const };
    if (args.claimedBy !== undefined && args.claimedBy !== code.claimedBy) {
      throw new ConvexError(
        `${code.code} is now claimed by ${code.claimedBy}, not ${args.claimedBy}. Nothing was released.`
      );
    }
    await ctx.db.patch(code._id, { claimedBy: undefined, claimedAt: undefined });
    // Dynamic events enroll attendees when they claim, so a claimant left
    // with no code is taken off again and the hidden event leaves their home
    // page. List events keep the attendee, who can claim again.
    const event = await ctx.db.get(code.eventId);
    if (event?.dynamic) {
      const claimedBy = code.claimedBy;
      const remaining = await ctx.db
        .query("codes")
        .withIndex("by_event_claimedBy", (q) =>
          q.eq("eventId", code.eventId).eq("claimedBy", claimedBy)
        )
        .first();
      const row = remaining
        ? null
        : await ctx.db
            .query("emails")
            .withIndex("by_event_email", (q) =>
              q.eq("eventId", code.eventId).eq("email", claimedBy)
            )
            .unique();
      if (row && row.blockedAt === undefined) await ctx.db.delete(row._id);
    }
    await logAudit(ctx, {
      eventId: code.eventId,
      action: "code_released",
      actorEmail: actorEmail ?? undefined,
      subjectEmail: code.claimedBy,
      details: `Released claimed code ${code.code} from ${code.claimedBy} back to the pool`,
    });
    return { released: true as const, claimedBy: code.claimedBy };
  },
});
