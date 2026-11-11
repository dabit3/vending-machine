import { normalizeEmail } from "./attendee-identity";

// Organizers an admin can name while creating an event. Bounded so the create
// mutation stays small; more can be added on the manage page.
export const MAX_ORGANIZERS_ON_CREATE = 20;

// Splits a pasted list of organizer emails (commas, semicolons, whitespace or
// newlines between them) into normalized, de-duplicated addresses, and reports
// the entries that are not valid emails.
export function parseOrganizerEmails(input: string): {
  emails: string[];
  invalid: string[];
} {
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const raw of input.split(/[\s,;]+/)) {
    if (!raw) continue;
    const email = normalizeEmail(raw);
    if (!email) {
      if (!invalid.includes(raw)) invalid.push(raw);
    } else if (!emails.includes(email)) {
      emails.push(email);
    }
  }
  return { emails, invalid };
}

// Admin lists can be added in bulk (see lib/admin-emails.ts). Bounded per
// request so a pasted list can't become an unbounded mutation.
export const MAX_BULK_ADMINS = 200;
