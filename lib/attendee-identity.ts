// Events identify attendees either by verified email (the default) or by
// their X (Twitter) handle. Both kinds share the same string fields
// (`emails.email`, `codes.claimedBy`, ...): emails are stored lowercased,
// handles are stored lowercased with a leading "@" so the two can never
// collide or be confused (an email never starts with "@").
export type AttendeeIdentity = "email" | "x";

export const ATTENDEE_IDENTITIES: {
  value: AttendeeIdentity;
  label: string;
}[] = [
  { value: "email", label: "Email address" },
  { value: "x", label: "X (Twitter) handle" },
];

const X_HANDLE = /^[a-z0-9_]{1,15}$/;

// Accepts "handle", "@handle", "x.com/handle", "https://twitter.com/@handle"
// (case-insensitive) and returns the canonical "@handle" key, or null when the
// input isn't a valid X username.
export function normalizeXHandle(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  value = value.replace(/^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\//, "");
  value = value.replace(/[/?#].*$/, "");
  value = value.replace(/^@+/, "");
  return X_HANDLE.test(value) ? `@${value}` : null;
}

export function normalizeEmail(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  return value.includes("@") && !value.startsWith("@") ? value : null;
}

// Canonical form of a normalized identity key for anti-abuse checks
// (blacklist, cross-event cooldown, duplicate flagging, and dynamic-event
// double-claim prevention). Strips "+tag" subaddressing on all email domains,
// maps googlemail.com to gmail.com, and strips dots in Gmail local parts.
// X handles ("@handle") are already canonical.
export function canonicalIdentityKey(key: string): string {
  const trimmed = key.trim().toLowerCase();
  if (!trimmed || trimmed.startsWith("@")) return trimmed;
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed;
  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) {
    local = local.slice(0, plus);
  }
  if (domain === "googlemail.com") {
    domain = "gmail.com";
  }
  if (domain === "gmail.com") {
    const stripped = local.replace(/\./g, "");
    if (stripped) local = stripped;
  }
  return `${local}@${domain}`;
}

export function normalizeIdentityKey(
  identity: AttendeeIdentity,
  raw: string
): string | null {
  return identity === "x" ? normalizeXHandle(raw) : normalizeEmail(raw);
}

export function isXHandleKey(key: string): boolean {
  return key.startsWith("@");
}

// Admin-facing wording for the attendee list, keyed by the event's identity
// kind so every label, placeholder and toast agrees.
export function identityLabels(identity: AttendeeIdentity) {
  if (identity === "x") {
    return {
      noun: "handle",
      plural: "handles",
      Plural: "Handles",
      addressNoun: "X handle",
      addressPlural: "X handles",
      placeholder: "@one\n@two",
      inputPlaceholder: "@handle",
      exportName: "handles",
    };
  }
  return {
    noun: "email",
    plural: "emails",
    Plural: "Emails",
    addressNoun: "email address",
    addressPlural: "email addresses",
    placeholder: "one@example.com\ntwo@example.com",
    inputPlaceholder: "attendee@example.com",
    exportName: "emails",
  };
}

// Search input that names an attendee (an email, @handle or X profile link)
// rather than part of an event name.
export function looksLikeAttendeeQuery(input: string): boolean {
  return /@|(?:x|twitter)\.com\//i.test(input.trim());
}
