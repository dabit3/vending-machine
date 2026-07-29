// Formats a YYYY-MM-DD event date by its parts — new Date("2026-07-17")
// parses as UTC midnight, which renders as the previous day in some zones.
export function formatEventDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Whole days from `now` until the event date: 0 = today, 1 = tomorrow,
// negative = already past.
export function daysUntilEvent(date: string, now: Date = new Date()): number {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return 0;
  const eventDay = new Date(year, month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((eventDay.getTime() - today.getTime()) / MS_PER_DAY);
}

// Short countdown label for upcoming events; null once the event has passed.
export function eventCountdownLabel(date: string, now?: Date): string | null {
  const days = daysUntilEvent(date, now);
  if (days < 0) return null;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

export function relativeTime(timestamp: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
