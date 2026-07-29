import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireEventAdmin } from "./admins";

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    return await ctx.db
      .query("codes")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
  },
});

export const add = mutation({
  args: { eventId: v.id("events"), codes: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    const existing = await ctx.db
      .query("codes")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const existingSet = new Set(existing.map((c) => c.code));
    let added = 0;
    let skipped = 0;
    for (const raw of args.codes) {
      const code = raw.trim();
      if (!code || existingSet.has(code)) {
        skipped++;
        continue;
      }
      existingSet.add(code);
      await ctx.db.insert("codes", { eventId: args.eventId, code });
      added++;
    }
    if (added > 0) {
      const event = await ctx.db.get(args.eventId);
      if (event) {
        await ctx.db.patch(args.eventId, {
          codeCount: (event.codeCount ?? existing.length) + added,
        });
      }
    }
    return { added, skipped };
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const email = identity.email?.trim().toLowerCase();
    if (!email || identity.emailVerified !== true) return null;

    const claimed = await ctx.db
      .query("codes")
      .withIndex("by_claimedBy", (q) => q.eq("claimedBy", email))
      .collect();
    const items = await Promise.all(
      claimed.map(async (c) => {
        const event = await ctx.db.get(c.eventId);
        return {
          _id: c._id,
          code: c.code,
          claimedAt: c.claimedAt,
          event: event
            ? {
                _id: event._id,
                name: event.name,
                slug: event.slug,
                creditAmount: event.creditAmount,
                eventDate: event.eventDate,
                eventUrl: event.eventUrl,
              }
            : null,
        };
      })
    );
    return items.sort((a, b) => (b.claimedAt ?? 0) - (a.claimedAt ?? 0));
  },
});

export const remove = mutation({
  args: { id: v.id("codes") },
  handler: async (ctx, args) => {
    const code = await ctx.db.get(args.id);
    if (!code) return;
    await requireEventAdmin(ctx, code.eventId);
    if (code.claimedBy) {
      throw new Error(
        `Cannot remove ${code.code} — it was already dispensed to ${code.claimedBy}. Deleting it would let them claim a second code.`
      );
    }
    await ctx.db.delete(args.id);
    const event = await ctx.db.get(code.eventId);
    if (event) {
      await ctx.db.patch(code.eventId, {
        codeCount: Math.max(0, (event.codeCount ?? 1) - 1),
      });
    }
  },
});
