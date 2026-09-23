import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { attachBatchToEvent, startBatch } from "./stripeBatchModel";
import { generationFields } from "./stripeValidation";
import { notExpired } from "./codeExpiry";
import { isBlacklisted } from "./blacklist";
import { eventIdentity, resolveViewer, viewerIdentityKeys } from "./identity";
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

const identityValidator = v.union(v.literal("email"), v.literal("x"));

// Empty -> undefined; expects YYYY-MM-DD from the date input.
function normalizeEventDate(raw?: string): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || isNaN(Date.parse(trimmed))) {
    throw new Error("Enter a valid event date");
  }
  return trimmed;
}

// Events are never listed publicly; attendees reach them through the claim
// URL / QR code their organizer shares. Clients built before the home page
// stopped listing events still subscribe to this until they reload.
export const list = query({
  args: {},
  handler: async () => [],
});

// Upper bound on the participant-list and claim rows read for one viewer.
// Nobody is on anywhere near this many events; it exists so a single query
// can never exceed Convex's per-request read limits.
const MINE_ROWS = 200;

// The home page only lists the events the signed-in viewer is on the
// participant list for (which, for dynamic events, means they have already
// interacted with it) or has claimed a code from, soonest first.
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    // A viewer may be known by their email on some events and by their X
    // handle on others; list both.
    const keys = await viewerIdentityKeys(ctx);
    if (keys.length === 0) return null;
    const memberships: Doc<"emails">[] = [];
    const claimed: Doc<"codes">[] = [];
    for (const key of keys) {
      if (await isBlacklisted(ctx, key)) continue;
      memberships.push(
        ...(await ctx.db
          .query("emails")
          .withIndex("by_email", (q) => q.eq("email", key))
          .take(MINE_ROWS))
      );
      claimed.push(
        ...(await ctx.db
          .query("codes")
          .withIndex("by_claimedBy", (q) => q.eq("claimedBy", key))
          .take(MINE_ROWS))
      );
    }
    const claimedEventIds = new Set(claimed.map((c) => c.eventId));
    const eventIds = [
      ...new Set([...memberships.map((m) => m.eventId), ...claimedEventIds]),
    ];
    const events = await Promise.all(eventIds.map((id) => ctx.db.get(id)));
    return events
      .filter((event) => event !== null)
      .map((event) => ({
        _id: event._id,
        _creationTime: event._creationTime,
        name: event.name,
        slug: event.slug,
        description: event.description,
        eventDate: event.eventDate,
        claimed: claimedEventIds.has(event._id),
      }))
      .sort((a, b) => {
        if (a.eventDate && b.eventDate) return a.eventDate.localeCompare(b.eventDate);
        if (a.eventDate) return -1;
        if (b.eventDate) return 1;
        return b._creationTime - a._creationTime;
      });
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
    // either unreserved or reserved for the viewer's identity, matching what
    // claims.claim would actually hand out. The event carries its (at most
    // two) distinct code types, so availability is one bounded probe per type
    // instead of a scan of the pool. An unnamed pool is represented as ""; two
    // pools are always both named. Events created before the type list existed
    // have a single unnamed pool.
    const viewer = await resolveViewer(ctx, event);
    const viewerKey = viewer.ok ? viewer.key : undefined;
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
    if (viewerKey) {
      const reserved = await ctx.db
        .query("codes")
        .withIndex("by_event_reservedFor", (q) =>
          q.eq("eventId", event._id).eq("reservedFor", viewerKey)
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
      identity: eventIdentity(event),
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
      dynamic: event.dynamic,
      identity: eventIdentity(event),
      createdBy: event.createdBy,
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
      dynamic: event.dynamic,
      identity: eventIdentity(event),
      createdBy: event.createdBy,
    }));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    eventDate: v.optional(v.string()),
    claimInstructions: v.optional(v.string()),
    dynamic: v.optional(v.boolean()),
    identity: v.optional(identityValidator),
    // Accepted but ignored: sent by admin forms loaded before the Hidden
    // option was removed.
    hidden: v.optional(v.boolean()),
    stripeGeneration: v.optional(v.object(generationFields)),
    stripeBatchId: v.optional(v.id("stripeBatches")),
  },
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    const creator = identity.email!.trim().toLowerCase();
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
      dynamic: args.dynamic || undefined,
      identity: args.identity === "x" ? "x" : undefined,
      createdBy: creator,
    });
    if (args.stripeGeneration) await startBatch(ctx, args.stripeGeneration, id);
    if (args.stripeBatchId) {
      const batch = await ctx.db.get(args.stripeBatchId);
      if (!batch) throw new ConvexError("Batch not found.");
      const error = await attachBatchToEvent(ctx, batch, id, creator);
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
    dynamic: v.optional(v.boolean()),
    identity: v.optional(identityValidator),
    hidden: v.optional(v.boolean()),
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
    const current = await ctx.db.get(args.id);
    if (!current) throw new Error("Event not found");
    // Participant and claim rows are keyed by the identity in force when they
    // were written, so the kind can only change while there are none.
    if (args.identity !== undefined && args.identity !== eventIdentity(current)) {
      const participant = await ctx.db
        .query("emails")
        .withIndex("by_event", (q) => q.eq("eventId", args.id))
        .first();
      const claimed = await ctx.db
        .query("codes")
        .withIndex("by_event_claimedBy", (q) =>
          q.eq("eventId", args.id).gt("claimedBy", "")
        )
        .first();
      if (participant || claimed) {
        throw new ConvexError(
          "Remove the participant list and reset any claims before changing how attendees are identified."
        );
      }
    }
    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      slug,
      description: args.description?.trim() || undefined,
      eventDate: normalizeEventDate(args.eventDate),
      claimInstructions: args.claimInstructions?.trim() || undefined,
      dynamic: args.dynamic || undefined,
      // Older admin forms don't send `identity`; leave the setting untouched
      // rather than resetting the event to email.
      ...(args.identity !== undefined
        ? { identity: args.identity === "x" ? ("x" as const) : undefined }
        : {}),
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
