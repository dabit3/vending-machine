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
  return Math.round((eventDay.getTime() - now.getTime()) / MS_PER_DAY);
}

// Short countdown label for upcoming events; null once the event has passed.
export function eventCountdownLabel(date: string, now?: Date): string | null {
  const days = daysUntilEvent(date, now);
  if (days < 0) return null;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}
