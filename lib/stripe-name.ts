export const STRIPE_BATCH_NAME_MAX_LENGTH = 40;
export const STRIPE_CODE_PREFIX_MAX_LENGTH = 4;
export const STRIPE_CODE_PREFIX_ERROR =
  `Use up to ${STRIPE_CODE_PREFIX_MAX_LENGTH} letters (A–Z) for the code prefix.`;

export function normalizeStripeCodePrefix(raw = ""): string | null {
  const prefix = raw.trim();
  if (prefix.length > STRIPE_CODE_PREFIX_MAX_LENGTH || /[^A-Za-z]/.test(prefix))
    return null;
  return prefix.toUpperCase();
}

export function generateStripeCodePrefix(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from(
    { length: STRIPE_CODE_PREFIX_MAX_LENGTH },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("");
}

export function truncateStripeBatchName(name: string): string {
  return name
    .slice(0, STRIPE_BATCH_NAME_MAX_LENGTH)
    .replace(/[\uD800-\uDBFF]$/, "");
}
