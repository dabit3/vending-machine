// Email domain matching and validation for company-domain claim links.
// Domains are stored lowercased without a leading "@" (e.g. "acme.com").

export const MAX_ALLOWED_DOMAINS = 20;

const DOMAIN_LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const DOMAIN_TLD = "(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})";
const DOMAIN_RE = new RegExp(`^(?:${DOMAIN_LABEL}\\.)+${DOMAIN_TLD}$`);

const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
]);

// Accepts "acme.com", "@acme.com", or "https://acme.com/" (case-insensitive)
// and returns the lowercased hostname, or null when invalid (including full
// email addresses like "alice@acme.com").
export function normalizeDomain(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value.startsWith("@")) {
    value = value.slice(1);
  }
  value = value.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (value.length > 253 || value.includes("@")) return null;
  return DOMAIN_RE.test(value) ? value : null;
}

// Parses comma-, semicolon-, or whitespace-separated domains, deduplicating
// while preserving entry order.
export function parseAllowedDomains(input: string): {
  domains: string[];
  invalid: string[];
} {
  const domains: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const token of input.split(/[\s,;]+/)) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const normalized = normalizeDomain(trimmed);
    if (!normalized) {
      invalid.push(trimmed);
      continue;
    }
    if (!seen.has(normalized)) {
      seen.add(normalized);
      domains.push(normalized);
    }
  }
  return { domains, invalid };
}

export function normalizeAllowedDomainsList(raw: readonly string[]): {
  domains: string[];
  invalid: string[];
} {
  return parseAllowedDomains(raw.join("\n"));
}

export function isPublicEmailDomain(domain: string): boolean {
  return PUBLIC_EMAIL_DOMAINS.has(domain.toLowerCase());
}

export function hasAllowedDomains(
  event: { allowedDomains?: readonly string[] } | null | undefined,
): boolean {
  return Boolean(event?.allowedDomains && event.allowedDomains.length > 0);
}

// Extracts the lowercased domain from an email address, or null for non-emails
// (such as "@handle" X keys).
export function emailDomain(email: string): string | null {
  const value = email.trim().toLowerCase();
  if (!value || value.startsWith("@")) return null;
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  return value.slice(at + 1);
}

// Exact domain match against an event's allowedDomains list.
export function matchesAllowedDomain(
  email: string,
  allowedDomains: readonly string[] | undefined,
): boolean {
  if (!allowedDomains || allowedDomains.length === 0) return false;
  const domain = emailDomain(email);
  return domain !== null && allowedDomains.includes(domain);
}

// Human-readable list for attendee-facing copy:
// ["acme.com"] -> "@acme.com"
// ["acme.com", "acme.io"] -> "@acme.com or @acme.io"
// ["a.com", "b.com", "c.com"] -> "@a.com, @b.com, or @c.com"
export function formatAllowedDomains(domains: readonly string[]): string {
  const tagged = domains.map((d) => `@${d}`);
  if (tagged.length === 0) return "";
  if (tagged.length === 1) return tagged[0];
  if (tagged.length === 2) return `${tagged[0]} or ${tagged[1]}`;
  return `${tagged.slice(0, -1).join(", ")}, or ${tagged[tagged.length - 1]}`;
}
