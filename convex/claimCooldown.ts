import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { canonicalIdentityKey, isXHandleKey } from "../lib/attendee-identity";
import {
  claimCooldown,
  claimsByEvent,
  type ClaimCooldown,
} from "../lib/claim-cooldown";

// An identity's claim history across all events, matching exact keys,
// canonical email aliases (+tag / Gmail dots), and the Clerk user ID (both
// passed directly and discovered from prior claims or linked X accounts) so
// switching emails or mixing email + X events cannot reset the 60-day limit
// and organizers can see and waive account-linked cooldowns in listCooldowns.
// The cooldown counts events, not codes; `total` stays the number of codes.
export async function claimHistory(
  ctx: QueryCtx | MutationCtx,
  key: string,
  userId?: string
): Promise<ClaimCooldown> {
  const byId = new Map<Id<"codes">, Doc<"codes">>();
  const add = (rows: Doc<"codes">[]) => {
    for (const row of rows) byId.set(row._id, row);
  };

  add(
    await ctx.db
      .query("codes")
      .withIndex("by_claimedBy", (q) => q.eq("claimedBy", key))
      .collect()
  );

  const canonical = canonicalIdentityKey(key);
  if (canonical !== key) {
    add(
      await ctx.db
        .query("codes")
        .withIndex("by_claimedBy", (q) => q.eq("claimedBy", canonical))
        .collect()
    );
  }
  add(
    await ctx.db
      .query("codes")
      .withIndex("by_claimedByCanonical", (q) =>
        q.eq("claimedByCanonical", canonical)
      )
      .collect()
  );

  const userIds = new Set<string>();
  if (userId) userIds.add(userId);
  for (const row of byId.values()) {
    if (row.claimedByUserId) userIds.add(row.claimedByUserId);
  }
  if (isXHandleKey(key)) {
    const xAccount = await ctx.db
      .query("xAccounts")
      .withIndex("by_handle", (q) => q.eq("handle", key))
      .first();
    if (xAccount) userIds.add(xAccount.clerkUserId);
  }

  for (const uid of userIds) {
    add(
      await ctx.db
        .query("codes")
        .withIndex("by_claimedByUserId", (q) => q.eq("claimedByUserId", uid))
        .collect()
    );
  }

  const claims = [...byId.values()];
  return { ...claimCooldown(claimsByEvent(claims)), total: claims.length };
}
