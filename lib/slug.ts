// Client-side mirror of the slug rules in convex/events.ts — used only for
// previews (e.g. the slug field placeholder); the server remains the source
// of truth when an event is actually created.
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Matches every non-empty slug that `slugify` can produce. Rejects crawler
// probes like `/sitemap.xml` or `/wp-login.php` before hitting Convex.
const EVENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidEventSlug(slug: string): boolean {
  return EVENT_SLUG_PATTERN.test(slug);
}
