// Attendees may claim at CLAIM_LIMIT events within a rolling
// CLAIM_WINDOW_MS; after that they wait until the oldest in-window claim
// ages out. A claim is one event: an event that dispenses several codes to
// each attendee still counts once (see claimsByEvent). Legacy claims without
// a claimedAt count in `total` but, having no date, never toward the window.
export const CLAIM_LIMIT = 2;
export const CLAIM_WINDOW_DAYS = 60;
export const CLAIM_WINDOW_MS = CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export type ClaimCooldown = {
  // All codes this identity has ever claimed.
  total: number;
  // Events claimed from inside the rolling window.
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

// Collapses claimed codes into one claim per event, dated by the first code
// taken there, so receiving two codes from one event uses one claim.
export function claimsByEvent(
  codes: { eventId: string; claimedAt?: number }[]
): { claimedAt?: number }[] {
  const firstByEvent = new Map<string, number | undefined>();
  for (const code of codes) {
    const seen = firstByEvent.has(code.eventId);
    const prior = firstByEvent.get(code.eventId);
    firstByEvent.set(
      code.eventId,
      !seen
        ? code.claimedAt
        : prior === undefined || code.claimedAt === undefined
          ? (prior ?? code.claimedAt)
          : Math.min(prior, code.claimedAt)
    );
  }
  return [...firstByEvent.values()].map((claimedAt) => ({ claimedAt }));
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
  return `Already claimed at ${n} event${n === 1 ? "" : "s"} in the past ${CLAIM_WINDOW_DAYS} days${cooldown.eligibleAt ? `, eligible again on ${formatClaimDate(cooldown.eligibleAt)}` : ""}`;
}
