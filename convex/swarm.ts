import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Swarm demo endpoints. These are intentionally public (no admin identity):
// swarm agents run on separate machines and report over the Convex HTTP API.
// Everything they create is scoped to hidden events tracked in swarmEvents.

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export const report = mutation({
  args: {
    sessionId: v.string(),
    name: v.string(),
    level: v.number(),
    parentSessionId: v.optional(v.string()),
    role: v.string(),
    status: v.string(),
    task: v.optional(v.string()),
    detail: v.optional(v.string()),
    eventsStocked: v.optional(v.number()),
    pagesQAd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("swarmAgents")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    const doc = { ...args, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, doc);
    } else {
      await ctx.db.insert("swarmAgents", doc);
    }
  },
});

export const stockEvent = mutation({
  args: {
    sessionId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    codeCount: v.number(),
  },
  handler: async (ctx, args) => {
    const codeCount = Math.max(1, Math.min(50, Math.floor(args.codeCount)));
    const base = slugify(args.name);
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
    const eventId = await ctx.db.insert("events", {
      name: args.name.trim(),
      slug,
      description: args.description?.trim() || undefined,
      hidden: true,
      codeTypes: [""],
    });
    for (let i = 0; i < codeCount; i++) {
      const code = `SWARM-${slug.slice(0, 12)}-${(i + 1)
        .toString()
        .padStart(3, "0")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      await ctx.db.insert("codes", { eventId, code });
    }
    await ctx.db.insert("swarmEvents", {
      sessionId: args.sessionId,
      eventId,
      slug,
      name: args.name.trim(),
      codeCount,
    });
    return { eventId, slug, codeCount };
  },
});

export const stockedEvents = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("swarmEvents").order("desc").collect();
  },
});

export const board = query({
  args: {},
  handler: async (ctx) => {
    const agents = await ctx.db.query("swarmAgents").collect();
    const events = await ctx.db.query("swarmEvents").order("desc").collect();
    return {
      agents: agents.sort(
        (a, b) => a.level - b.level || a._creationTime - b._creationTime
      ),
      events: events.map((e) => ({
        _id: e._id,
        slug: e.slug,
        name: e.name,
        codeCount: e.codeCount,
        sessionId: e.sessionId,
      })),
    };
  },
});
