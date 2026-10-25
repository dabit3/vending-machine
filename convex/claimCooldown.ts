import type { MutationCtx, QueryCtx } from "./_generated/server";
import { claimCooldown, type ClaimCooldown } from "../lib/claim-cooldown";

// Every code an identity has claimed, across all events, via by_claimedBy.
export async function claimHistory(
  ctx: QueryCtx | MutationCtx,
  key: string
): Promise<ClaimCooldown> {
  const claims = await ctx.db
    .query("codes")
    .withIndex("by_claimedBy", (q) => q.eq("claimedBy", key))
    .collect();
  return claimCooldown(claims);
}
