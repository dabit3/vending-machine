import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  claimCooldown,
  claimsByEvent,
  type ClaimCooldown,
} from "../lib/claim-cooldown";

// An identity's claim history across all events, via by_claimedBy. The
// cooldown counts events, not codes, so an event that hands each attendee
// several codes uses one claim; `total` stays the number of codes.
export async function claimHistory(
  ctx: QueryCtx | MutationCtx,
  key: string
): Promise<ClaimCooldown> {
  const claims = await ctx.db
    .query("codes")
    .withIndex("by_claimedBy", (q) => q.eq("claimedBy", key))
    .collect();
  return { ...claimCooldown(claimsByEvent(claims)), total: claims.length };
}
