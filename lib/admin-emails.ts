import { extractEmails } from "./spreadsheet";

// Pasted admin / organizer lists: any email-shaped token anywhere in the
// text counts; everything else (comment lines like "# Speakers", names,
// blank lines) is ignored rather than rejected, so notes can sit between
// the addresses. Kept out of organizer-emails.ts because that file is
// imported by Convex functions and spreadsheet.ts is browser-only.
export function extractAdminEmails(input: string): string[] {
  return extractEmails(input.split(/\r?\n/).map((line) => line.split(/[\s,;]+/)));
}
