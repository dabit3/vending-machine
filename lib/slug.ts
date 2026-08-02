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
