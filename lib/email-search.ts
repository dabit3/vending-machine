export type EmailStatusFilter = "all" | "claimed" | "unclaimed";

export const EMAIL_STATUS_FILTERS: {
  value: EmailStatusFilter;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "claimed", label: "Claimed" },
  { value: "unclaimed", label: "Unclaimed" },
];

// Case-insensitive substring match on the address (a blank query matches
// all), optionally narrowed to addresses that have or haven't claimed a code.
export function filterEmails<T extends { email: string; claimed?: boolean }>(
  items: T[],
  query: string,
  status: EmailStatusFilter = "all"
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle && status === "all") return items;
  return items.filter(
    (item) =>
      (status === "all" ||
        (status === "claimed") === (item.claimed === true)) &&
      (!needle || item.email.toLowerCase().includes(needle))
  );
}
