import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { adminEmailStatus, requireAdmin, requireEventAdmin } from "./admins";

// App-wide blacklist managed exclusively by global admins. Blacklisted
// addresses are rejected whenever they would be added to any event's
// eligible list.
export async function isBlacklisted(
  ctx: QueryCtx | MutationCtx,
  email: string
) {
  const match = await ctx.db
    .query("blacklistedEmails")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  return match !== null;
}

// Records that a blacklisted address was rejected while being added to an
// event, so event admins can see which uploaded emails were blocked.
export async function recordBlacklistHit(
  ctx: MutationCtx,
  eventId: Id<"events">,
  email: string
) {
  const existing = await ctx.db
    .query("blacklistHits")
    .withIndex("by_event_email", (q) =>
      q.eq("eventId", eventId).eq("email", email)
    )
    .unique();
  if (!existing) {
    await ctx.db.insert("blacklistHits", { eventId, email });
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("blacklistedEmails").collect();
  },
});

export const add = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const email = args.email.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      throw new Error("Enter a valid email address");
    }
    const existing = await ctx.db
      .query("blacklistedEmails")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) throw new Error(`${email} is already blacklisted`);
    const { email: actorEmail } = await adminEmailStatus(ctx);
    await ctx.db.insert("blacklistedEmails", {
      email,
      addedBy: actorEmail ?? undefined,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("blacklistedEmails") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const entry = await ctx.db.get(args.id);
    if (!entry) return;
    await ctx.db.delete(args.id);
    // Clear the rejection records so events stop showing the address as
    // blacklisted once it's off the list.
    const hits = await ctx.db
      .query("blacklistHits")
      .withIndex("by_email", (q) => q.eq("email", entry.email))
      .collect();
    for (const hit of hits) {
      await ctx.db.delete(hit._id);
    }
  },
});

// Blacklisted addresses rejected while being added to this event.
export const listHits = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    return await ctx.db
      .query("blacklistHits")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
  },
});
