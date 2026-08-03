import { query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireEventAdmin } from "./admins";

export async function logAudit(
  ctx: MutationCtx,
  entry: {
    eventId: Id<"events">;
    action: string;
    actorEmail?: string;
    subjectEmail?: string;
    details?: string;
  }
) {
  await ctx.db.insert("auditLogs", entry);
}

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    const entries = await ctx.db
      .query("auditLogs")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .take(200);
    return entries;
  },
});
