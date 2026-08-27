// Convex object field names may not start with "$" or "_" — in stored
// documents and in query return values alike — so block names beginning with
// those characters live under a space-prefixed key everywhere, and readers
// (server and client) look values up via blockKey. Block names are trimmed
// on write, so the escaped form cannot collide with a real name.
export function blockKey(codeType: string | undefined): string {
  const key = codeType ?? "";
  return /^[$_]/.test(key) ? ` ${key}` : key;
}

// The value shown for a code is its block's value, falling back to the
// legacy event-wide creditAmount for events created before per-block values.
export function blockValue(
  event: { codeTypeValues?: Record<string, string>; creditAmount?: string },
  codeType: string | undefined
): string | undefined {
  return event.codeTypeValues?.[blockKey(codeType)] ?? event.creditAmount;
}
