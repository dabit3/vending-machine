export const STRIPE_BATCH_NAME_MAX_LENGTH = 40;

export function truncateStripeBatchName(name: string): string {
  return name
    .slice(0, STRIPE_BATCH_NAME_MAX_LENGTH)
    .replace(/[\uD800-\uDBFF]$/, "");
}
