import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireEventAdmin } from "./admins";
import { logAudit } from "./auditLog";

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
    let flagged = 0;
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
      // Emails already signed up for other events are held for manual
      // review instead of being added directly.
      const otherEvents = (
        await ctx.db
          .query("emails")
          .withIndex("by_email", (q) => q.eq("email", email))
          .collect()
      ).filter((e) => e.eventId !== args.eventId);
      if (otherEvents.length > 0) {
        const alreadyFlagged = await ctx.db
          .query("flaggedEmails")
          .withIndex("by_event_email", (q) =>
            q.eq("eventId", args.eventId).eq("email", email)
          )
          .unique();
        if (alreadyFlagged) {
          skipped++;
        } else {
          await ctx.db.insert("flaggedEmails", {
            eventId: args.eventId,
            email,
            matchedEventIds: [...new Set(otherEvents.map((e) => e.eventId))],
          });
          flagged++;
        }
        continue;
      }
      await ctx.db.insert("emails", { eventId: args.eventId, email });
      added++;
    }
    return { added, skipped, flagged };
  },
});

export const listFlagged = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    const flagged = await ctx.db
      .query("flaggedEmails")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    return await Promise.all(
      flagged.map(async (f) => {
        const events = await Promise.all(
          f.matchedEventIds.map((id) => ctx.db.get(id))
        );
        return {
          _id: f._id,
          email: f.email,
          matchedEvents: events
            .filter((e) => e !== null)
            .map((e) => ({ id: e._id, name: e.name })),
        };
      })
    );
  },
});

export const approveFlagged = mutation({
  args: { id: v.id("flaggedEmails") },
  handler: async (ctx, args) => {
    const flagged = await ctx.db.get(args.id);
    if (!flagged) return;
    const actorEmail = await requireEventAdmin(ctx, flagged.eventId);
    const existing = await ctx.db
      .query("emails")
      .withIndex("by_event_email", (q) =>
        q.eq("eventId", flagged.eventId).eq("email", flagged.email)
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("emails", {
        eventId: flagged.eventId,
        email: flagged.email,
      });
    }
    await ctx.db.delete(args.id);
    await logAudit(ctx, {
      eventId: flagged.eventId,
      action: "flagged_email_approved",
      actorEmail: actorEmail ?? undefined,
      subjectEmail: flagged.email,
      details: `Duplicate across ${flagged.matchedEventIds.length} other event(s)`,
    });
  },
});

export const rejectFlagged = mutation({
  args: { id: v.id("flaggedEmails") },
  handler: async (ctx, args) => {
    const flagged = await ctx.db.get(args.id);
    if (!flagged) return;
    const actorEmail = await requireEventAdmin(ctx, flagged.eventId);
    await ctx.db.delete(args.id);
    await logAudit(ctx, {
      eventId: flagged.eventId,
      action: "flagged_email_rejected",
      actorEmail: actorEmail ?? undefined,
      subjectEmail: flagged.email,
      details: `Duplicate across ${flagged.matchedEventIds.length} other event(s)`,
    });
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
    // Drop an approved access request for this email so the attendee can
    // request access again instead of being stuck showing "approved".
    const request = await ctx.db
      .query("accessRequests")
      .withIndex("by_event_email", (q) =>
        q.eq("eventId", email.eventId).eq("email", email.email)
      )
      .unique();
    if (request && request.status === "approved") {
      await ctx.db.delete(request._id);
    }
  },
});
