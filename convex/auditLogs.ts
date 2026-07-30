import { query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireEventAdmin } from "./admins";

export async function recordAudit(
  ctx: MutationCtx,
  entry: {
    eventId: Id<"events">;
    actor: string;
    action: string;
    subjectEmail?: string;
    details?: string;
  }
) {
  await ctx.db.insert("auditLogs", entry);
}

export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    return await ctx.db
      .query("auditLogs")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .take(200);
  },
});
