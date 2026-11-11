import { extractEmails } from "./spreadsheet";

// Pasted admin / organizer lists: any email-shaped token anywhere in the
// text counts; everything else (comment lines like "# Speakers", names,
// blank lines) is ignored rather than rejected, so notes can sit between
// the addresses. Kept out of organizer-emails.ts because that file is
// imported by Convex functions and spreadsheet.ts is browser-only.
export function extractAdminEmails(input: string): string[] {
  return extractEmails(input.split(/\r?\n/).map((line) => line.split(/[\s,;]+/)));
}

// Summary line for a bulk add toast: "3 organizers added, 1 already added
// or invalid".
export function bulkAddSummary(
  { added, skipped }: { added: number; skipped: number },
  noun: string
): string {
  const one = noun.replace(/s$/, "");
  const parts = [`${added} ${added === 1 ? one : noun} added`];
  if (skipped > 0) parts.push(`${skipped} already added or invalid`);
  return parts.join(", ");
}
