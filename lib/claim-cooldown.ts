// Attendees may claim at most CLAIM_LIMIT codes across all events within a
// rolling CLAIM_WINDOW_MS; after that they wait until the oldest in-window
// claim ages out. Legacy claims without a claimedAt count in `total` but,
// having no date, never toward the window.
export const CLAIM_LIMIT = 2;
export const CLAIM_WINDOW_DAYS = 60;
export const CLAIM_WINDOW_MS = CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export type ClaimCooldown = {
  // All codes this identity has ever claimed.
  total: number;
  // Claims inside the rolling window.
  recent: number;
  // When the attendee may claim again; undefined while under the limit.
  eligibleAt?: number;
};

export function claimCooldown(
  claims: { claimedAt?: number }[],
  now: number = Date.now()
): ClaimCooldown {
  const since = now - CLAIM_WINDOW_MS;
  const recent = claims
    .map((c) => c.claimedAt)
    .filter((t): t is number => t !== undefined && t > since)
    .sort((a, b) => a - b);
  const over = recent.length - CLAIM_LIMIT;
  return {
    total: claims.length,
    recent: recent.length,
    eligibleAt: over >= 0 ? recent[over] + CLAIM_WINDOW_MS : undefined,
  };
}

export function formatClaimDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function cooldownNotice(
  cooldown: Pick<ClaimCooldown, "recent" | "eligibleAt">
): string {
  const n = cooldown.recent;
  return `Already claimed ${n} code${n === 1 ? "" : "s"} in the past ${CLAIM_WINDOW_DAYS} days${cooldown.eligibleAt ? `, eligible again on ${formatClaimDate(cooldown.eligibleAt)}` : ""}`;
}
