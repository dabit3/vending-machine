import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./admins";

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("emails")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
  },
});

export const add = mutation({
  args: { eventId: v.id("events"), emails: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
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
    await requireAdmin(ctx);
    await ctx.db.delete(args.id);
  },
});
