import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { adminEmailStatus, requireEventAdmin } from "./admins";
import { isBlacklisted, recordBlacklistHit } from "./blacklist";
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
    let blacklisted = 0;
    const seen = new Set<string>();
    for (const raw of args.emails) {
      const email = raw.trim().toLowerCase();
      if (!email || !email.includes("@") || seen.has(email)) {
        skipped++;
        continue;
      }
      seen.add(email);
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
      if (await isBlacklisted(ctx, email)) {
        await recordBlacklistHit(ctx, args.eventId, email);
        blacklisted++;
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
        const matchedEventIds = [...new Set(otherEvents.map((e) => e.eventId))];
        if (alreadyFlagged) {
          // Still pending review — refresh the matches so the organizer sees
          // every event the address appears in, and report as flagged so
          // callers don't treat it as an ordinary duplicate that can claim.
          await ctx.db.patch(alreadyFlagged._id, { matchedEventIds });
          flagged++;
        } else {
          await ctx.db.insert("flaggedEmails", {
            eventId: args.eventId,
            email,
            matchedEventIds,
          });
          flagged++;
        }
        continue;
      }
      await ctx.db.insert("emails", { eventId: args.eventId, email });
      // A stale review entry (e.g. left over after the matching event was
      // deleted) is resolved by the address becoming eligible normally.
      const staleFlag = await ctx.db
        .query("flaggedEmails")
        .withIndex("by_event_email", (q) =>
          q.eq("eventId", args.eventId).eq("email", email)
        )
        .unique();
      if (staleFlag) {
        await ctx.db.delete(staleFlag._id);
      }
      added++;
    }
    return { added, skipped, flagged, blacklisted };
  },
});

const FLAGGED_PAGE_SIZE = 200;

export const listFlagged = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const callerEmail = await requireEventAdmin(ctx, args.eventId);
    const { isAdmin: isGlobalAdmin } = await adminEmailStatus(ctx);
    // Bounded page plus memoized per-event lookups keep the query within
    // Convex's per-request read limits after large uploads.
    const rows = await ctx.db
      .query("flaggedEmails")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .take(FLAGGED_PAGE_SIZE + 1);
    const hasMore = rows.length > FLAGGED_PAGE_SIZE;
    const eventCache = new Map<
      Id<"events">,
      { name: string; canSee: boolean } | null
    >();
    const entries = [];
    for (const f of rows.slice(0, FLAGGED_PAGE_SIZE)) {
      // Event names are only disclosed for events the caller can manage;
      // matches in other admins' events are reported as a count.
      const matchedEvents: { id: Id<"events">; name: string }[] = [];
      let otherMatchCount = 0;
      for (const eventId of f.matchedEventIds) {
        let info = eventCache.get(eventId);
        if (info === undefined) {
          const event = await ctx.db.get(eventId);
          if (!event) {
            info = null;
          } else {
            let canSee = isGlobalAdmin;
            if (!canSee && callerEmail) {
              const membership = await ctx.db
                .query("eventAdmins")
                .withIndex("by_event_email", (q) =>
                  q.eq("eventId", eventId).eq("email", callerEmail)
                )
                .unique();
              canSee = membership !== null;
            }
            info = { name: event.name, canSee };
          }
          eventCache.set(eventId, info);
        }
        if (!info) continue;
        // The stored matches are a snapshot; only show events where the
        // address is still on the eligible list.
        const stillListed = await ctx.db
          .query("emails")
          .withIndex("by_event_email", (q) =>
            q.eq("eventId", eventId).eq("email", f.email)
          )
          .unique();
        if (!stillListed) continue;
        if (info.canSee) {
          matchedEvents.push({ id: eventId, name: info.name });
        } else {
          otherMatchCount++;
        }
      }
      entries.push({ _id: f._id, email: f.email, matchedEvents, otherMatchCount });
    }
    return { entries, hasMore };
  },
});

export const approveFlagged = mutation({
  args: { id: v.id("flaggedEmails") },
  handler: async (ctx, args) => {
    const flagged = await ctx.db.get(args.id);
    if (!flagged) return;
    const actorEmail = await requireEventAdmin(ctx, flagged.eventId);
    const event = await ctx.db.get(flagged.eventId);
    if (!event) {
      await ctx.db.delete(args.id);
      return;
    }
    if (await isBlacklisted(ctx, flagged.email)) {
      throw new Error(`${flagged.email} is blacklisted and cannot be added`);
    }
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
    // The address may have become eligible through another path (e.g. an
    // approved access request) while flagged — rejection removes it from the
    // eligible list and releases any code held for it.
    const eligible = await ctx.db
      .query("emails")
      .withIndex("by_event_email", (q) =>
        q.eq("eventId", flagged.eventId).eq("email", flagged.email)
      )
      .unique();
    if (eligible) {
      await ctx.db.delete(eligible._id);
      const reserved = await ctx.db
        .query("codes")
        .withIndex("by_event_reservedFor", (q) =>
          q.eq("eventId", flagged.eventId).eq("reservedFor", flagged.email)
        )
        .filter((q) => q.eq(q.field("claimedBy"), undefined))
        .collect();
      for (const code of reserved) {
        await ctx.db.patch(code._id, { reservedFor: undefined });
      }
      // Drop an approved access request so the attendee isn't stuck showing
      // "approved" while no longer being eligible.
      const request = await ctx.db
        .query("accessRequests")
        .withIndex("by_event_email", (q) =>
          q.eq("eventId", flagged.eventId).eq("email", flagged.email)
        )
        .unique();
      if (request && request.status === "approved") {
        await ctx.db.delete(request._id);
      }
    }
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
