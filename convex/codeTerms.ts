import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { CodeTerms } from "../lib/block-value";

// Redemption and duration terms of an event's Stripe codes, keyed by code
// string. Codes absent from the map redeem once for one invoice.
export async function eventCodeTerms(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">
): Promise<Map<string, CodeTerms>> {
  const batches = await ctx.db
    .query("stripeBatches")
    .withIndex("by_target_event", (q) => q.eq("targetEventId", eventId))
    .collect();
  const terms = new Map<string, CodeTerms>();
  for (const b of batches) {
    const redemptions = b.redemptionsPerCode ?? 1;
    const months = b.durationMonths ?? 1;
    if (b.eventId !== eventId || (redemptions <= 1 && months <= 1)) continue;
    for (const c of b.codes) terms.set(c.code, { redemptions, months });
  }
  return terms;
}

export async function codeTermsFor(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  code: string | undefined
): Promise<CodeTerms | undefined> {
  if (code === undefined) return undefined;
  return (await eventCodeTerms(ctx, eventId)).get(code);
}
