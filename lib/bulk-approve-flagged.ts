import type { Id } from "@/convex/_generated/dataModel";

const APPROVAL_CONCURRENCY = 10;

export async function bulkApproveFlagged(
  ids: readonly Id<"flaggedEmails">[],
  approve: (args: { id: Id<"flaggedEmails"> }) => Promise<unknown>,
) {
  const uniqueIds = [...new Set(ids)];
  let approved = 0;
  let failed = 0;
  let skipped = 0;
  for (let i = 0; i < uniqueIds.length; i += APPROVAL_CONCURRENCY) {
    const results = await Promise.allSettled(
      uniqueIds
        .slice(i, i + APPROVAL_CONCURRENCY)
        .map(async (id) => approve({ id })),
    );
    for (const result of results) {
      if (result.status === "rejected") failed++;
      else if (result.value === false) skipped++;
      else approved++;
    }
  }
  return { approved, failed, skipped };
}
