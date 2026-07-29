const UNITS = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
] as const;

export function formatRelativeTime(timestamp: number, now = Date.now()) {
  const elapsed = Math.max(0, now - timestamp);
  for (const [unit, duration] of UNITS) {
    const count = Math.floor(elapsed / duration);
    if (count > 0) {
      return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}
