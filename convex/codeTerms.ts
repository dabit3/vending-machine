import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { CodeTerms } from "../lib/block-value";

type Ctx = QueryCtx | MutationCtx;

function batchTerms(batch: Doc<"stripeBatches"> | null): CodeTerms | undefined {
  if (!batch) return undefined;
  const redemptions = batch.redemptionsPerCode ?? 1;
  const months = batch.durationMonths ?? 1;
  return redemptions > 1 || months > 1 ? { redemptions, months } : undefined;
}

// Redemption and duration terms of a code; undefined means it redeems once
// for one invoice.
export async function codeTerms(
  ctx: Ctx,
  code: Pick<Doc<"codes">, "stripeBatchId">
): Promise<CodeTerms | undefined> {
  return code.stripeBatchId
    ? batchTerms(await ctx.db.get(code.stripeBatchId))
    : undefined;
}

// One-off: link codes attached before `stripeBatchId` existed to their batch,
// one attached batch per run. Start with
// `npx convex run codeTerms:backfillBatchIds`.
export const backfillBatchIds = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("stripeBatches")
      .paginate({ cursor: args.cursor ?? null, numItems: 1 });
    for (const batch of page.page) {
      if (!batch.eventId) continue;
      const batchCodes = new Set(batch.codes.map((c) => c.code));
      const rows = await ctx.db
        .query("codes")
        .withIndex("by_event", (q) => q.eq("eventId", batch.eventId!))
        .collect();
      for (const row of rows)
        if (!row.stripeBatchId && batchCodes.has(row.code))
          await ctx.db.patch(row._id, { stripeBatchId: batch._id });
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.codeTerms.backfillBatchIds, {
        cursor: page.continueCursor,
      });
  },
});
