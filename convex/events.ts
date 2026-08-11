import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { adminEmailStatus, requireAdmin, requireEventAdmin } from "./admins";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Empty -> undefined; expects YYYY-MM-DD from the date input.
function normalizeEventDate(raw?: string): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || isNaN(Date.parse(trimmed))) {
    throw new Error("Enter a valid event date");
  }
  return trimmed;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("events").order("desc").collect();
    return events.map((event) => ({
      _id: event._id,
      _creationTime: event._creationTime,
      name: event.name,
      slug: event.slug,
      description: event.description,
      eventDate: event.eventDate,
    }));
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!event) return null;
    // One row is enough to know whether anything is left to dispense —
    // claimers who already have a code can still retrieve it regardless.
    // A code counts as available for the viewer when it is unclaimed and
    // either unreserved or reserved for the viewer's verified email, matching
    // what claims.claim would actually hand out.
    const identity = await ctx.auth.getUserIdentity();
    const viewerEmail =
      identity?.emailVerified === true
        ? identity.email?.trim().toLowerCase()
        : undefined;
    let available = await ctx.db
      .query("codes")
      .withIndex("by_event_claimedBy", (q) =>
        q.eq("eventId", event._id).eq("claimedBy", undefined)
      )
      .filter((q) => q.eq(q.field("reservedFor"), undefined))
      .first();
    if (!available && viewerEmail) {
      available = await ctx.db
        .query("codes")
        .withIndex("by_event_reservedFor", (q) =>
          q.eq("eventId", event._id).eq("reservedFor", viewerEmail)
        )
        .filter((q) => q.eq(q.field("claimedBy"), undefined))
        .first();
    }
    return {
      _id: event._id,
      _creationTime: event._creationTime,
      name: event.name,
      slug: event.slug,
      description: event.description,
      eventDate: event.eventDate,
      soldOut: available === null,
    };
  },
});

export const get = query({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.id);
    const event = await ctx.db.get(args.id);
    if (!event) return null;
    return {
      _id: event._id,
      _creationTime: event._creationTime,
      name: event.name,
      slug: event.slug,
      description: event.description,
      creditAmount: event.creditAmount,
      eventDate: event.eventDate,
    };
  },
});

// Dashboard listing: global admins see every event, event admins only theirs.
export const listManaged = query({
  args: {},
  handler: async (ctx) => {
    const { email, isAdmin } = await adminEmailStatus(ctx);
    let events;
    if (isAdmin) {
      events = await ctx.db.query("events").order("desc").collect();
    } else {
      if (!email) return [];
      const memberships = await ctx.db
        .query("eventAdmins")
        .withIndex("by_email", (q) => q.eq("email", email))
        .collect();
      const loaded = await Promise.all(
        memberships.map((m) => ctx.db.get(m.eventId))
      );
      events = loaded
        .filter((event) => event !== null)
        .sort((a, b) => b._creationTime - a._creationTime);
    }
    return events.map((event) => ({
      _id: event._id,
      _creationTime: event._creationTime,
      name: event.name,
      slug: event.slug,
      description: event.description,
      eventDate: event.eventDate,
    }));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    creditAmount: v.optional(v.string()),
    eventDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const base = slugify(args.slug?.trim() || args.name);
    if (!base) throw new Error("Event name must contain letters or numbers");
    let slug = base;
    while (
      await ctx.db
        .query("events")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique()
    ) {
      slug = `${base}-${Math.random().toString(36).slice(2, 8)}`;
    }
    const id = await ctx.db.insert("events", {
      name: args.name.trim(),
      slug,
      description: args.description?.trim() || undefined,
      creditAmount: args.creditAmount?.trim() || undefined,
      eventDate: normalizeEventDate(args.eventDate),
    });
    return { id, slug };
  },
});

export const update = mutation({
  args: {
    id: v.id("events"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    creditAmount: v.optional(v.string()),
    eventDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.id);
    const slug = slugify(args.slug);
    if (!slug) throw new Error("Slug must contain letters or numbers");
    const existing = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing && existing._id !== args.id) {
      throw new Error(`Slug "${slug}" is already taken`);
    }
    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      slug,
      description: args.description?.trim() || undefined,
      creditAmount: args.creditAmount?.trim() || undefined,
      eventDate: normalizeEventDate(args.eventDate),
    });
    return { slug };
  },
});

export const remove = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_event", (q) => q.eq("eventId", args.id))
      .collect();
    for (const email of emails) await ctx.db.delete(email._id);
    const codes = await ctx.db
      .query("codes")
      .withIndex("by_event", (q) => q.eq("eventId", args.id))
      .collect();
    for (const code of codes) await ctx.db.delete(code._id);
    const eventAdmins = await ctx.db
      .query("eventAdmins")
      .withIndex("by_event", (q) => q.eq("eventId", args.id))
      .collect();
    for (const admin of eventAdmins) await ctx.db.delete(admin._id);
    const requests = await ctx.db
      .query("accessRequests")
      .withIndex("by_event", (q) => q.eq("eventId", args.id))
      .collect();
    for (const request of requests) await ctx.db.delete(request._id);
    const auditLogs = await ctx.db
      .query("auditLogs")
      .withIndex("by_event", (q) => q.eq("eventId", args.id))
      .collect();
    for (const entry of auditLogs) await ctx.db.delete(entry._id);
    await ctx.db.delete(args.id);
  },
});
