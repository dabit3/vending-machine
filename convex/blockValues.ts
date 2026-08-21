// The value shown for a code is its block's value, falling back to the
// legacy event-wide creditAmount for events created before per-block values.
export function blockValue(
  event: { codeTypeValues?: Record<string, string>; creditAmount?: string },
  codeType: string | undefined
): string | undefined {
  return event.codeTypeValues?.[codeType ?? ""] ?? event.creditAmount;
}
