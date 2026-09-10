import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

// Writes a ledger row for a code's claim if none exists. Used when a claimed
// code is about to be deleted (re-claim, event deletion) so the dispense
// survives in `claimEvents`. Post-ledger claims already recorded the same
// (eventId, email, claimedAt) triple at claim time, so this is a no-op for
// them.
export async function preserveClaim(
  ctx: MutationCtx,
  code: Pick<Doc<"codes">, "eventId" | "claimedBy" | "claimedAt" | "codeType">,
) {
  if (!code.claimedBy || code.claimedAt === undefined) return;
  const existing = await ctx.db
    .query("claimEvents")
    .withIndex("by_event", (q) => q.eq("eventId", code.eventId))
    .filter((q) =>
      q.and(
        q.eq(q.field("email"), code.claimedBy),
        q.eq(q.field("claimedAt"), code.claimedAt),
      ),
    )
    .first();
  if (existing) return;
  await ctx.db.insert("claimEvents", {
    eventId: code.eventId,
    email: code.claimedBy,
    codeType: code.codeType,
    claimedAt: code.claimedAt,
  });
}
