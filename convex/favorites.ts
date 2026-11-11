import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { adminEmailStatus } from "./admins";
import { isBlacklisted } from "./blacklist";
import { viewerIdentityKeys } from "./identity";

// Upper bound on the stars read for one viewer, so a query stays well inside
// Convex's per-request read limits.
export const MAX_FAVORITES = 100;

// Stars belong to the signed-in account, not to an email or X handle, so
// they follow the person across the admin and attendee sides of the app.
async function viewerId(ctx: QueryCtx | MutationCtx) {
  return (await ctx.auth.getUserIdentity())?.subject ?? null;
}

// The ids of the events the viewer has starred.
export async function favoriteEventIds(
  ctx: QueryCtx | MutationCtx
): Promise<Set<Id<"events">>> {
  const user = await viewerId(ctx);
  if (!user) return new Set();
  const rows = await ctx.db
    .query("eventFavorites")
    .withIndex("by_user_event", (q) => q.eq("user", user))
    .take(MAX_FAVORITES);
  return new Set(rows.map((row) => row.eventId));
}

// How the viewer relates to an event: they manage it (system admin or one of
// its organizers), they attend it (on its participant list and not blocked,
// or already claimed from it), or neither.
async function viewerRole(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">
): Promise<"manage" | "attend" | null> {
  const { email, isAdmin } = await adminEmailStatus(ctx);
  if (isAdmin) return "manage";
  if (email) {
    const organizer = await ctx.db
      .query("eventAdmins")
      .withIndex("by_event_email", (q) =>
        q.eq("eventId", event._id).eq("email", email)
      )
      .unique();
    if (organizer) return "manage";
  }
  for (const key of await viewerIdentityKeys(ctx)) {
    if (await isBlacklisted(ctx, key)) continue;
    const member = await ctx.db
      .query("emails")
      .withIndex("by_event_email", (q) =>
        q.eq("eventId", event._id).eq("email", key)
      )
      .first();
    if (member && member.blockedAt === undefined) return "attend";
    const claimed = await ctx.db
      .query("codes")
      .withIndex("by_event_claimedBy", (q) =>
        q.eq("eventId", event._id).eq("claimedBy", key)
      )
      .first();
    if (claimed) return "attend";
  }
  return null;
}

// Stars or unstars an event for the signed-in viewer. Only events the viewer
// manages or attends can be starred; anything can be unstarred.
export const set = mutation({
  args: { eventId: v.id("events"), favorite: v.boolean() },
  handler: async (ctx, args) => {
    const user = await viewerId(ctx);
    if (!user) throw new ConvexError("Sign in to star events.");
    const existing = await ctx.db
      .query("eventFavorites")
      .withIndex("by_user_event", (q) =>
        q.eq("user", user).eq("eventId", args.eventId)
      )
      .collect();
    if (!args.favorite) {
      for (const row of existing) await ctx.db.delete(row._id);
      return;
    }
    if (existing.length > 0) return;
    const event = await ctx.db.get(args.eventId);
    if (!event || !(await viewerRole(ctx, event))) {
      throw new ConvexError("Event not found.");
    }
    const count = (
      await ctx.db
        .query("eventFavorites")
        .withIndex("by_user_event", (q) => q.eq("user", user))
        .take(MAX_FAVORITES)
    ).length;
    if (count >= MAX_FAVORITES) {
      throw new ConvexError(
        `You can star up to ${MAX_FAVORITES} events. Unstar one first.`
      );
    }
    await ctx.db.insert("eventFavorites", { user, eventId: args.eventId });
  },
});

// The viewer's starred events for the home page: the ones they manage link
// to the manage page, the ones they attend to the claim page. A star on an
// event the viewer has since lost access to is left out.
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const starred = await favoriteEventIds(ctx);
    const events = [];
    for (const id of starred) {
      const event = await ctx.db.get(id);
      if (!event) continue;
      const role = await viewerRole(ctx, event);
      if (!role) continue;
      events.push({
        _id: event._id,
        _creationTime: event._creationTime,
        name: event.name,
        slug: event.slug,
        description: event.description,
        eventDate: event.eventDate,
        eventEndDate: event.eventEndDate,
        manages: role === "manage",
      });
    }
    return events;
  },
});
