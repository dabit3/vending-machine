const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

function unit(value: number, singular: string): string {
  return `${value} ${singular}${value === 1 ? "" : "s"} ago`;
}

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const elapsed = Math.max(0, now - timestamp);

  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return unit(Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return unit(Math.floor(elapsed / HOUR), "hour");
  if (elapsed < WEEK) return unit(Math.floor(elapsed / DAY), "day");
  if (elapsed < MONTH) return unit(Math.floor(elapsed / WEEK), "week");
  if (elapsed < YEAR) return unit(Math.floor(elapsed / MONTH), "month");
  return unit(Math.floor(elapsed / YEAR), "year");
}
