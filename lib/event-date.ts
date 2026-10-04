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

function parseParts(date: string): [number, number, number] | null {
  const [year, month, day] = date.split("-").map(Number);
  return year && month && day ? [year, month, day] : null;
}

// "Oct 10, 2026" for one day; "Oct 10 – 12, 2026", "Oct 30 – Nov 2, 2026"
// or "Dec 30, 2026 – Jan 2, 2027" for a multi-day event.
export function formatEventDateRange(start: string, end?: string): string {
  const a = parseParts(start);
  const b = end ? parseParts(end) : null;
  if (!a || !b || end! <= start) return formatEventDate(start);
  const startDate = new Date(a[0], a[1] - 1, a[2]);
  const endDate = new Date(b[0], b[1] - 1, b[2]);
  const md = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (a[0] !== b[0]) return `${formatEventDate(start)} – ${formatEventDate(end!)}`;
  const endLabel = a[1] === b[1] ? String(b[2]) : md(endDate);
  return `${md(startDate)} – ${endLabel}, ${b[0]}`;
}

// Last day the event runs: the end date for multi-day events, else the date.
export function eventLastDay(start: string, end?: string): string {
  return end && end > start ? end : start;
}

// Whole days since the event's last day; > 0 once it has ended.
export function daysSinceEventEnded(
  start: string,
  end?: string,
  now?: Date
): number {
  return 0 - daysUntilEvent(eventLastDay(start, end), now);
}

// Whether `now` falls on any day of the event.
export function isEventLive(start: string, end?: string, now?: Date): boolean {
  return daysUntilEvent(start, now) <= 0 && daysSinceEventEnded(start, end, now) <= 0;
}
