import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireEventAdmin } from "./admins";
import { EMAIL_SHAPE, MAX_BULK_ADMINS } from "../lib/organizer-emails";

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const callerEmail = await requireEventAdmin(ctx, args.eventId);
    const admins = await ctx.db
      .query("eventAdmins")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    return admins.map((admin) => ({
      _id: admin._id,
      email: admin.email,
      isSelf: admin.email === callerEmail,
    }));
  },
});

export const add = mutation({
  args: { eventId: v.id("events"), email: v.string() },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    const email = args.email.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      throw new Error("Enter a valid email address");
    }
    const existing = await ctx.db
      .query("eventAdmins")
      .withIndex("by_event_email", (q) =>
        q.eq("eventId", args.eventId).eq("email", email)
      )
      .unique();
    if (existing) throw new Error(`${email} is already an admin of this event`);
    await ctx.db.insert("eventAdmins", { eventId: args.eventId, email });
  },
});

// Bulk add: invalid entries and existing organizers are skipped, not errors.
export const addMany = mutation({
  args: { eventId: v.id("events"), emails: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    if (args.emails.length > MAX_BULK_ADMINS) {
      throw new Error(
        `Add at most ${MAX_BULK_ADMINS} organizers per request (got ${args.emails.length}).`
      );
    }
    let added = 0;
    let skipped = 0;
    const seen = new Set<string>();
    for (const raw of args.emails) {
      const email = raw.trim().toLowerCase();
      if (!EMAIL_SHAPE.test(email) || seen.has(email)) {
        skipped++;
        continue;
      }
      seen.add(email);
      const existing = await ctx.db
        .query("eventAdmins")
        .withIndex("by_event_email", (q) =>
          q.eq("eventId", args.eventId).eq("email", email)
        )
        .unique();
      if (existing) {
        skipped++;
        continue;
      }
      await ctx.db.insert("eventAdmins", { eventId: args.eventId, email });
      added++;
    }
    return { added, skipped };
  },
});

export const remove = mutation({
  args: { id: v.id("eventAdmins") },
  handler: async (ctx, args) => {
    const eventAdmin = await ctx.db.get(args.id);
    if (!eventAdmin) return;
    await requireEventAdmin(ctx, eventAdmin.eventId);
    await ctx.db.delete(args.id);
  },
});
