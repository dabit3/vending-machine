import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./admins";

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("codes")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
  },
});

export const add = mutation({
  args: { eventId: v.id("events"), codes: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
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
    return { added, skipped };
  },
});

export const remove = mutation({
  args: { id: v.id("codes") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const code = await ctx.db.get(args.id);
    if (!code) return;
    if (code.claimedBy) {
      throw new Error(
        `Cannot remove ${code.code} — it was already dispensed to ${code.claimedBy}. Deleting it would let them claim a second code.`
      );
    }
    await ctx.db.delete(args.id);
  },
});
