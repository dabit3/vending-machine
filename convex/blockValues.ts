// Convex object field names may not start with "$" or "_", so block names
// beginning with those characters are stored under a space-prefixed key.
// Block names are trimmed on write, so the escaped form cannot collide with
// a real name.
export function blockKey(codeType: string | undefined): string {
  const key = codeType ?? "";
  return /^[$_]/.test(key) ? ` ${key}` : key;
}

// Maps stored codeTypeValues keys back to the block names they represent.
export function decodeBlockValues(
  values: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!values) return values;
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      /^ [$_]/.test(key) ? key.slice(1) : key,
      value,
    ])
  );
}

// The value shown for a code is its block's value, falling back to the
// legacy event-wide creditAmount for events created before per-block values.
export function blockValue(
  event: { codeTypeValues?: Record<string, string>; creditAmount?: string },
  codeType: string | undefined
): string | undefined {
  return event.codeTypeValues?.[blockKey(codeType)] ?? event.creditAmount;
}
