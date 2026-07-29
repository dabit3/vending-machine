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

// Empty -> undefined; bare domains get https://; anything unparseable throws.
function normalizeUrl(raw?: string): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    new URL(withProtocol);
  } catch {
    throw new Error("Enter a valid event URL");
  }
  return withProtocol;
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
    const events = (await ctx.db.query("events").order("desc").collect()).filter(
      (event) => !event.hidden
    );
    return events.map((event) => ({
      _id: event._id,
      _creationTime: event._creationTime,
      name: event.name,
      slug: event.slug,
      hidden: event.hidden,
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
    return {
      _id: event._id,
      _creationTime: event._creationTime,
      name: event.name,
      slug: event.slug,
      hidden: event.hidden,
      description: event.description,
      eventUrl: event.eventUrl,
      eventDate: event.eventDate,
      codeCount: event.codeCount ?? 0,
      remainingCodeCount: Math.max(
        0,
        (event.codeCount ?? 0) - (event.claimedCodeCount ?? 0)
      ),
    };
  },
});

export const get = query({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.id);
    return await ctx.db.get(args.id);
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
      hidden: event.hidden,
      description: event.description,
    }));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    hidden: v.optional(v.boolean()),
    description: v.optional(v.string()),
    creditAmount: v.optional(v.string()),
    eventUrl: v.optional(v.string()),
    eventDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const slug = slugify(args.slug?.trim() || args.name);
    if (!slug) throw new Error("Event name must contain letters or numbers");
    const existing = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) throw new Error(`Slug "${slug}" is already taken`);
    const id = await ctx.db.insert("events", {
      name: args.name.trim(),
      slug,
      hidden: args.hidden ?? false,
      codeCount: 0,
      claimedCodeCount: 0,
      description: args.description?.trim() || undefined,
      creditAmount: args.creditAmount?.trim() || undefined,
      eventUrl: normalizeUrl(args.eventUrl),
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
    hidden: v.optional(v.boolean()),
    description: v.optional(v.string()),
    creditAmount: v.optional(v.string()),
    eventUrl: v.optional(v.string()),
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
      hidden: args.hidden ?? false,
      description: args.description?.trim() || undefined,
      creditAmount: args.creditAmount?.trim() || undefined,
      eventUrl: normalizeUrl(args.eventUrl),
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
    await ctx.db.delete(args.id);
  },
});
