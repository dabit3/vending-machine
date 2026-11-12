// The receipt shown right after a claim is local state, and an organizer can
// release a code while it is on screen. `held` is the attendee's live list
// (undefined while it loads, or in an admin preview), so released codes drop
// off the receipt instead of staying visible until the page is reopened.
export function stillHeld<T extends { code: string }>(
  shown: T[],
  held: { code: string }[] | undefined
): T[] {
  if (!held) return shown;
  const live = new Set(held.map((c) => c.code));
  return shown.filter((c) => live.has(c.code));
}
