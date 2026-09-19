// Case-insensitive substring match on the address; a blank query matches all.
export function filterEmails<T extends { email: string }>(
  items: T[],
  query: string
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) => item.email.toLowerCase().includes(needle));
}
