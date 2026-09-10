import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { attachBatchToEvent, startBatch } from "./stripeBatchModel";
import { generationFields } from "./stripeValidation";
import { notExpired } from "./codeExpiry";
import {
  adminEmailStatus,
  isEventAdmin,
  requireAdmin,
  requireEventAdmin,
} from "./admins";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Empty -> undefined; expects YYYY-MM-DD from the date input.
function normalizeEventDate(raw?: string): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || isNaN(Date.parse(trimmed))) {
    throw new Error("Enter a valid event date");
  }
  return trimmed;
}

// Dynamic events are only reachable through their claim URL / QR code, so
// they are always hidden from the home page regardless of the stored flag.
function isHidden(event: { hidden?: boolean; dynamic?: boolean }) {
  return Boolean(event.hidden || event.dynamic);
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("events").order("desc").collect();
    return events
      .filter((event) => !isHidden(event))
      .map((event) => ({
        _id: event._id,
        _creationTime: event._creationTime,
        name: event.name,
        slug: event.slug,
        description: event.description,
        eventDate: event.eventDate,
      }));
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!event) return null;
    // A code counts as available for the viewer when it is unclaimed and
    // either unreserved or reserved for the viewer's verified email, matching
    // what claims.claim would actually hand out. The event carries its
    // (at most two) distinct code types, so availability is one bounded probe
    // per type instead of a scan of the pool. An unnamed pool is represented
    // as ""; two pools are always both named. Events created before the type
    // list existed have a single unnamed pool.
    const identity = await ctx.auth.getUserIdentity();
    const viewerEmail =
      identity?.emailVerified === true
        ? identity.email?.trim().toLowerCase()
        : undefined;
    const candidateTypes = event.codeTypes ?? [""];
    const availableTypes = new Set<string>();
    for (const typeKey of candidateTypes) {
      const hit = await ctx.db
        .query("codes")
        .withIndex("by_event_codeType_claimedBy", (q) =>
          q
            .eq("eventId", event._id)
            .eq("codeType", typeKey === "" ? undefined : typeKey)
            .eq("claimedBy", undefined)
        )
        .filter(notExpired)
        .filter((q) => q.eq(q.field("reservedFor"), undefined))
        .first();
      if (hit) availableTypes.add(typeKey);
    }
    if (viewerEmail) {
      const reserved = await ctx.db
        .query("codes")
        .withIndex("by_event_reservedFor", (q) =>
          q.eq("eventId", event._id).eq("reservedFor", viewerEmail)
        )
        .filter(notExpired)
        .filter((q) => q.eq(q.field("claimedBy"), undefined))
        .first();
      if (reserved) availableTypes.add(reserved.codeType ?? "");
    }
    return {
      _id: event._id,
      _creationTime: event._creationTime,
      name: event.name,
      slug: event.slug,
      description: event.description,
      eventDate: event.eventDate,
      claimInstructions: event.claimInstructions,
      creditAmount: event.creditAmount,
      codeTypeValues: event.codeTypeValues,
      dynamic: event.dynamic ?? false,
      // Lets the claim page show a manage link to this event's admins.
      viewerIsAdmin: await isEventAdmin(ctx, event._id),
      soldOut: availableTypes.size === 0,
      // Preserve the event's stored (creation) order of code types.
      codeTypes: [
        ...candidateTypes.filter((t) => availableTypes.has(t)),
        ...[...availableTypes].filter((t) => !candidateTypes.includes(t)),
      ],
    };
  },
});

export const get = query({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.id);
    const event = await ctx.db.get(args.id);
    if (!event) return null;
    return {
      _id: event._id,
      _creationTime: event._creationTime,
      name: event.name,
      slug: event.slug,
      description: event.description,
      creditAmount: event.creditAmount,
      codeTypes: event.codeTypes,
      codeTypeValues: event.codeTypeValues,
      eventDate: event.eventDate,
      claimInstructions: event.claimInstructions,
      hidden: isHidden(event) || undefined,
      dynamic: event.dynamic,
    };
  },
});

// Dashboard listing: global admins see every event, event admins only theirs.
export const listManaged = query({
  args: {},
  handler: async (ctx) => {
    const { email, isAdmin } = await adminEmailStatus(ctx);
    let events;
    if (isAdmin) {
      events = await ctx.db.query("events").order("desc").collect();
    } else {
      if (!email) return [];
      const memberships = await ctx.db
        .query("eventAdmins")
        .withIndex("by_email", (q) => q.eq("email", email))
        .collect();
      const loaded = await Promise.all(
        memberships.map((m) => ctx.db.get(m.eventId))
      );
      events = loaded
        .filter((event) => event !== null)
        .sort((a, b) => b._creationTime - a._creationTime);
    }
    return events.map((event) => ({
      _id: event._id,
      _creationTime: event._creationTime,
      name: event.name,
      slug: event.slug,
      description: event.description,
      eventDate: event.eventDate,
      hidden: isHidden(event) || undefined,
      dynamic: event.dynamic,
    }));
  },
});


// Aggregates for the global-admin history dashboard. Claims are bucketed by
// their `claimedAt` day so the calendar reads as real activity over time,
// while event dots use their event date (or creation date when undated).
export const history = query({
  args: { days: v.number() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const until = Date.now() + 24 * 60 * 60 * 1000;
    const since = until - (args.days + 1) * 24 * 60 * 60 * 1000;

    const [events, codes, emails, requests] = await Promise.all([
      ctx.db.query("events").collect(),
      ctx.db.query("codes").collect(),
      ctx.db.query("emails").collect(),
      ctx.db.query("accessRequests").collect(),
    ]);

    const eventInfo = new Map(
      events.map((event) => [
        event._id,
        {
          name: event.name,
          slug: event.slug,
          eventDate: event.eventDate,
          createdAt: event._creationTime,
        },
      ]),
    );

    const daily = new Map<string, number>();
    const perEvent = new Map<
      Id<"events">,
      {
        codes: number;
        claimed: number;
        attendees: Set<string>;
        eligible: number;
        requests: number;
        approved: number;
        denied: number;
        firstClaim: number | null;
        lastClaim: number | null;
      }
    >();
    const forEvent = (eventId: (typeof events)[number]["_id"]) => {
      let stats = perEvent.get(eventId);
      if (!stats) {
        stats = {
          codes: 0,
          claimed: 0,
          attendees: new Set<string>(),
          eligible: 0,
          requests: 0,
          approved: 0,
          denied: 0,
          firstClaim: null,
          lastClaim: null,
        };
        perEvent.set(eventId, stats);
      }
      return stats;
    };

    for (const code of codes) {
      const stats = forEvent(code.eventId);
      stats.codes++;
      if (!code.claimedBy) continue;
      stats.claimed++;
      stats.attendees.add(code.claimedBy);
      const at = code.claimedAt ?? code._creationTime;
      stats.firstClaim =
        stats.firstClaim === null ? at : Math.min(stats.firstClaim, at);
      stats.lastClaim =
        stats.lastClaim === null ? at : Math.max(stats.lastClaim, at);
      if (at >= since && at < until) {
        const day = new Date(at).toISOString().slice(0, 10);
        daily.set(day, (daily.get(day) ?? 0) + 1);
      }
    }

    for (const row of emails) forEvent(row.eventId).eligible++;
    for (const request of requests) {
      const stats = forEvent(request.eventId);
      stats.requests++;
      if (request.status === "approved") stats.approved++;
      if (request.status === "denied") stats.denied++;
    }

    return {
      since,
      until,
      daily: [...daily.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
      events: [...perEvent.entries()]
        .map(([eventId, stats]) => {
          const info = eventInfo.get(eventId);
          const anchor = info?.eventDate
            ? Date.parse(`${info.eventDate}T00:00:00Z`)
            : (info?.createdAt ?? 0);
          return {
            eventId,
            name: info?.name ?? "Deleted event",
            slug: info?.slug,
            anchor,
            codes: stats.codes,
            claimed: stats.claimed,
            eligible: stats.eligible,
            attendees: stats.attendees.size,
            requests: stats.requests,
            approved: stats.approved,
            denied: stats.denied,
            firstClaim: stats.firstClaim,
            lastClaim: stats.lastClaim,
            claimRate: stats.codes === 0 ? 0 : stats.claimed / stats.codes,
          };
        })
        .sort((a, b) => a.anchor - b.anchor),
      totals: {
        events: events.length,
        codes: codes.length,
        claimed: codes.filter((code) => code.claimedBy).length,
        attendees: new Set(
          codes.filter((code) => code.claimedBy).map((code) => code.claimedBy)
        ).size,
        requests: requests.length,
      },
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    eventDate: v.optional(v.string()),
    claimInstructions: v.optional(v.string()),
    hidden: v.optional(v.boolean()),
    dynamic: v.optional(v.boolean()),
    stripeGeneration: v.optional(v.object(generationFields)),
    stripeBatchId: v.optional(v.id("stripeBatches")),
  },
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    if (args.stripeGeneration && args.stripeBatchId) throw new ConvexError("Choose one code source.");
    const base = slugify(args.slug?.trim() || args.name);
    if (!base) throw new Error("Event name must contain letters or numbers");
    let slug = base;
    while (
      await ctx.db
        .query("events")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique()
    ) {
      slug = `${base}-${Math.random().toString(36).slice(2, 8)}`;
    }
    const id = await ctx.db.insert("events", {
      name: args.name.trim(),
      slug,
      description: args.description?.trim() || undefined,
      eventDate: normalizeEventDate(args.eventDate),
      claimInstructions: args.claimInstructions?.trim() || undefined,
      hidden: isHidden(args) || undefined,
      dynamic: args.dynamic || undefined,
    });
    if (args.stripeGeneration) await startBatch(ctx, args.stripeGeneration, id);
    if (args.stripeBatchId) {
      const batch = await ctx.db.get(args.stripeBatchId);
      if (!batch) throw new ConvexError("Batch not found.");
      const error = await attachBatchToEvent(ctx, batch, id, identity.email!.trim().toLowerCase());
      if (error) throw new ConvexError(error);
    }
    return { id, slug };
  },
});

export const update = mutation({
  args: {
    id: v.id("events"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    eventDate: v.optional(v.string()),
    claimInstructions: v.optional(v.string()),
    hidden: v.optional(v.boolean()),
    dynamic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.id);
    const slug = slugify(args.slug);
    if (!slug) throw new Error("Slug must contain letters or numbers");
    const existing = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing && existing._id !== args.id) {
      throw new Error(`Slug "${slug}" is already taken`);
    }
    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      slug,
      description: args.description?.trim() || undefined,
      eventDate: normalizeEventDate(args.eventDate),
      claimInstructions: args.claimInstructions?.trim() || undefined,
      hidden: isHidden(args) || undefined,
      dynamic: args.dynamic || undefined,
    });
    return { slug };
  },
});

export const remove = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_event", (q) => q.eq("eventId", args.id))
      .collect();
    for (const email of emails) await ctx.db.delete(email._id);
    const flagged = await ctx.db
      .query("flaggedEmails")
      .withIndex("by_event", (q) => q.eq("eventId", args.id))
      .collect();
    for (const entry of flagged) await ctx.db.delete(entry._id);
    const blacklistHits = await ctx.db
      .query("blacklistHits")
      .withIndex("by_event", (q) => q.eq("eventId", args.id))
      .collect();
    for (const hit of blacklistHits) await ctx.db.delete(hit._id);
    const codes = await ctx.db
      .query("codes")
      .withIndex("by_event", (q) => q.eq("eventId", args.id))
      .collect();
    for (const code of codes) await ctx.db.delete(code._id);
    const eventAdmins = await ctx.db
      .query("eventAdmins")
      .withIndex("by_event", (q) => q.eq("eventId", args.id))
      .collect();
    for (const admin of eventAdmins) await ctx.db.delete(admin._id);
    const requests = await ctx.db
      .query("accessRequests")
      .withIndex("by_event", (q) => q.eq("eventId", args.id))
      .collect();
    for (const request of requests) await ctx.db.delete(request._id);
    const auditLogs = await ctx.db
      .query("auditLogs")
      .withIndex("by_event", (q) => q.eq("eventId", args.id))
      .collect();
    for (const entry of auditLogs) await ctx.db.delete(entry._id);
    await ctx.db.delete(args.id);
  },
});
