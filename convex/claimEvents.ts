import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

// Writes ledger rows for claimed codes about to be deleted (re-claim, event
// deletion) so those dispenses survive in `claimEvents`. Loads each event's
// existing ledger once and dedupes in memory on (email, claimedAt), so cost
// stays linear instead of rescanning per code.
export async function preserveClaims(
  ctx: MutationCtx,
  codes: Pick<Doc<"codes">, "eventId" | "claimedBy" | "claimedAt" | "codeType">[],
) {
  const claimed = codes.filter(
    (code) => code.claimedBy !== undefined && code.claimedAt !== undefined,
  );
  const byEvent = new Map<string, typeof claimed>();
  for (const code of claimed) {
    const list = byEvent.get(code.eventId) ?? [];
    list.push(code);
    byEvent.set(code.eventId, list);
  }
  for (const [eventId, list] of byEvent) {
    const existing = await ctx.db
      .query("claimEvents")
      .withIndex("by_event", (q) =>
        q.eq("eventId", eventId as Doc<"codes">["eventId"]),
      )
      .collect();
    const keys = new Set(
      existing.map((row) => `${row.email}|${row.claimedAt}`),
    );
    for (const code of list) {
      const key = `${code.claimedBy}|${code.claimedAt}`;
      if (keys.has(key)) continue;
      keys.add(key);
      await ctx.db.insert("claimEvents", {
        eventId: code.eventId,
        email: code.claimedBy!,
        codeType: code.codeType,
        claimedAt: code.claimedAt!,
      });
    }
  }
}
