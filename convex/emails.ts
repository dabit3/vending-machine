import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireEventAdmin } from "./admins";

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    return await ctx.db
      .query("emails")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
  },
});

export const add = mutation({
  args: { eventId: v.id("events"), emails: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    let added = 0;
    let skipped = 0;
    for (const raw of args.emails) {
      const email = raw.trim().toLowerCase();
      if (!email || !email.includes("@")) {
        skipped++;
        continue;
      }
      const existing = await ctx.db
        .query("emails")
        .withIndex("by_event_email", (q) =>
          q.eq("eventId", args.eventId).eq("email", email)
        )
        .unique();
      if (existing) {
        skipped++;
        continue;
      }
      await ctx.db.insert("emails", { eventId: args.eventId, email });
      added++;
    }
    return { added, skipped };
  },
});

export const remove = mutation({
  args: { id: v.id("emails") },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.id);
    if (!email) return;
    await requireEventAdmin(ctx, email.eventId);
    await ctx.db.delete(args.id);
    // Release any unclaimed code reserved for this email so it returns to
    // the general pool instead of staying locked away.
    const reserved = await ctx.db
      .query("codes")
      .withIndex("by_event_reservedFor", (q) =>
        q.eq("eventId", email.eventId).eq("reservedFor", email.email)
      )
      .filter((q) => q.eq(q.field("claimedBy"), undefined))
      .collect();
    for (const code of reserved) {
      await ctx.db.patch(code._id, { reservedFor: undefined });
    }
  },
});
