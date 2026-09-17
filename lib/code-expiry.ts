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
