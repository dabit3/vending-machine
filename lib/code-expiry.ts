// Code expiry timestamps come from the Stripe batch's expiration date
// (end of day when it was set), so attendees only need the calendar date.
export function formatCodeExpiry(expiresAt: number): string {
  return new Date(expiresAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Attendee-facing expiry status for a code; null when the code never expires.
export function codeExpiry(
  expiresAt: number | undefined,
  now: number = Date.now()
): { label: string; expired: boolean } | null {
  if (expiresAt === undefined) return null;
  const date = formatCodeExpiry(expiresAt);
  const expired = expiresAt <= now;
  return { label: expired ? `Expired ${date}` : `Redeem by ${date}`, expired };
}

// Admin summary of when a block's codes expire: one date when they all
// share it, otherwise the earliest and latest dates.
export function blockExpirySummary(
  expiresAts: (number | undefined)[],
  now: number = Date.now()
): {
  label: string;
  status: "none" | "active" | "partlyExpired" | "expired";
} {
  const dated = expiresAts.filter((t): t is number => t !== undefined);
  if (dated.length === 0) return { label: "No expiry", status: "none" };
  const min = Math.min(...dated);
  const max = Math.max(...dated);
  const first = formatCodeExpiry(min);
  const last = formatCodeExpiry(max);
  const neverExpire = dated.length < expiresAts.length;
  const label =
    first === last
      ? neverExpire
        ? `${first} (some never expire)`
        : first
      : `${first} – ${last}`;
  const status =
    max <= now && !neverExpire
      ? "expired"
      : min <= now
        ? "partlyExpired"
        : "active";
  return { label, status };
}
