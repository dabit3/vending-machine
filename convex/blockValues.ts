// Convex object field names may not start with "$" or "_" — in stored
// documents and in query return values alike — so block names beginning with
// those characters live under a space-prefixed key everywhere, and readers
// (server and client) look values up via blockKey. Block names are trimmed
// on write, so the escaped form cannot collide with a real name.
export function blockKey(codeType: string | undefined): string {
  const key = codeType ?? "";
  if (/[^\x20-\x7e]/.test(key)) {
    const encoded = key
      .split("")
      .map((char) => char.charCodeAt(0).toString(16).padStart(4, "0"))
      .join("");
    return ` ~${encoded}`;
  }
  return /^[$_]/.test(key) ? ` ${key}` : key;
}

// The event's active code blocks ("" = unnamed), in creation order. The
// stored list is authoritative once present: deleting a block drops it from
// the list while its claimed codes stay behind for attendee receipts. Legacy
// events without a stored list derive their blocks from the codes themselves.
export function activeCodeTypes(
  event: { codeTypes?: string[] },
  codes: { codeType?: string; _creationTime: number }[]
): string[] {
  if (event.codeTypes) return event.codeTypes;
  return [
    ...new Set(
      [...codes]
        .sort((a, b) => a._creationTime - b._creationTime)
        .map((c) => c.codeType ?? "")
    ),
  ];
}

// The value shown for a code is its block's value, falling back to the
// legacy event-wide creditAmount for events created before per-block values.
export function blockValue(
  event: { codeTypeValues?: Record<string, string>; creditAmount?: string },
  codeType: string | undefined
): string | undefined {
  return event.codeTypeValues?.[blockKey(codeType)] ?? event.creditAmount;
}
