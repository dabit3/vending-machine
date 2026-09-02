import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { adminEmailStatus, requireAdmin, requireEventAdmin } from "./admins";
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
        // A pending review flag can never be approved for a blacklisted
        // address, so it's superseded by the rejection record.
        const pendingFlag = await ctx.db
          .query("flaggedEmails")
          .withIndex("by_event_email", (q) =>
            q.eq("eventId", args.eventId).eq("email", email)
          )
          .unique();
        if (pendingFlag) {
          await ctx.db.delete(pendingFlag._id);
        }
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

const ATTENDEE_SEARCH_ROWS = 200;
const ATTENDEE_SEARCH_LIMIT = 20;

// Cross-event history for addresses starting with `query`: every event the
// address was made eligible for, plus any code claims (which may exist even
// without an eligible-list row, e.g. after a re-claim or list cleanup).
// Prefix matching lets both lookups stay on their email indexes.
export const searchAttendees = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const prefix = args.query.trim().toLowerCase();
    if (!prefix) return { attendees: [], hasMore: false };
    const upper = prefix + "\uffff";

    const eligibleRows = await ctx.db
      .query("emails")
      .withIndex("by_email", (q) => q.gte("email", prefix).lt("email", upper))
      .take(ATTENDEE_SEARCH_ROWS);
    const claimRows = await ctx.db
      .query("codes")
      .withIndex("by_claimedBy", (q) =>
        q.gte("claimedBy", prefix).lt("claimedBy", upper)
      )
      .take(ATTENDEE_SEARCH_ROWS);

    type EventHistory = { eligible: boolean; claimedAt: number | null };
    const byEmail = new Map<string, Map<Id<"events">, EventHistory>>();
    const historyFor = (email: string, eventId: Id<"events">) => {
      let events = byEmail.get(email);
      if (!events) {
        events = new Map();
        byEmail.set(email, events);
      }
      let history = events.get(eventId);
      if (!history) {
        history = { eligible: false, claimedAt: null };
        events.set(eventId, history);
      }
      return history;
    };
    for (const row of eligibleRows) {
      historyFor(row.email, row.eventId).eligible = true;
    }
    for (const code of claimRows) {
      if (!code.claimedBy) continue;
      const history = historyFor(code.claimedBy, code.eventId);
      const claimedAt = code.claimedAt ?? code._creationTime;
      if (history.claimedAt === null || claimedAt > history.claimedAt) {
        history.claimedAt = claimedAt;
      }
    }

    const emails = [...byEmail.keys()].sort();
    const hasMore =
      emails.length > ATTENDEE_SEARCH_LIMIT ||
      eligibleRows.length === ATTENDEE_SEARCH_ROWS ||
      claimRows.length === ATTENDEE_SEARCH_ROWS;

    const eventCache = new Map<Id<"events">, Doc<"events"> | null>();
    const attendees = [];
    for (const email of emails.slice(0, ATTENDEE_SEARCH_LIMIT)) {
      const events = [];
      for (const [eventId, history] of byEmail.get(email)!) {
        let event = eventCache.get(eventId);
        if (event === undefined) {
          event = await ctx.db.get(eventId);
          eventCache.set(eventId, event);
        }
        if (!event) continue;
        events.push({
          id: eventId,
          name: event.name,
          eventDate: event.eventDate ?? null,
          createdAt: event._creationTime,
          eligible: history.eligible,
          claimedAt: history.claimedAt,
        });
      }
      // Most recent event first; undated events fall back to creation order.
      events.sort((a, b) => {
        if (a.eventDate && b.eventDate && a.eventDate !== b.eventDate) {
          return a.eventDate < b.eventDate ? 1 : -1;
        }
        return b.createdAt - a.createdAt;
      });
      attendees.push({ email, events });
    }
    return { attendees, hasMore };
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
