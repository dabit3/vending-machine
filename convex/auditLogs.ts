import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireEventAdmin } from "./admins";

export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .collect();
    return logs;
  },
});
