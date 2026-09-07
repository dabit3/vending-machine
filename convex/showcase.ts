import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { isEventAdmin, requireEventAdmin } from "./admins";
import { logAudit } from "./auditLog";

export const MAX_VOTES_PER_VOTER = 3;
const TITLE_MAX = 80;
const DESCRIPTION_MAX = 500;

async function verifiedEmail(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  const email = identity?.email?.trim().toLowerCase();
  if (!email || identity?.emailVerified !== true) return null;
  return email;
}

// Attendees are people on the whitelist or who already hold a code for the
// event; event admins may also participate so they can seed and demo it.
async function isAttendee(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  email: string,
) {
  const listed = await ctx.db
    .query("emails")
    .withIndex("by_event_email", (q) => q.eq("eventId", eventId).eq("email", email))
    .unique();
  if (listed) return true;
  const claimed = await ctx.db
    .query("codes")
    .withIndex("by_event_claimedBy", (q) =>
      q.eq("eventId", eventId).eq("claimedBy", email),
    )
    .first();
  if (claimed) return true;
  return isEventAdmin(ctx, eventId);
}

async function eventBySlug(ctx: QueryCtx | MutationCtx, slug: string) {
  return ctx.db
    .query("events")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

function normalizeUrl(raw?: string) {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("Enter a valid link");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Links must start with http:// or https://");
  }
  return parsed.toString();
}

export const board = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const event = await eventBySlug(ctx, args.slug);
    if (!event) return null;
    const viewerEmail = await verifiedEmail(ctx);
    const viewerIsAdmin = await isEventAdmin(ctx, event._id);
    const canParticipate =
      viewerEmail !== null && (await isAttendee(ctx, event._id, viewerEmail));

    const entries = await ctx.db
      .query("showcaseEntries")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();
    const myVotes = viewerEmail
      ? await ctx.db
          .query("showcaseVotes")
          .withIndex("by_event_voter", (q) =>
            q.eq("eventId", event._id).eq("voterEmail", viewerEmail),
          )
          .collect()
      : [];
    const votedIds = new Set(myVotes.map((vote) => vote.entryId));

    const ranked = [...entries].sort(
      (a, b) => b.voteCount - a.voteCount || a._creationTime - b._creationTime,
    );
    const totalVotes = entries.reduce((sum, entry) => sum + entry.voteCount, 0);

    return {
      event: {
        _id: event._id,
        name: event.name,
        slug: event.slug,
        showcaseOpen: event.showcaseOpen === true,
      },
      viewerIsAdmin,
      canParticipate,
      signedIn: viewerEmail !== null,
      votesRemaining: MAX_VOTES_PER_VOTER - myVotes.length,
      maxVotes: MAX_VOTES_PER_VOTER,
      totalVotes,
      entries: ranked.map((entry, index) => ({
        _id: entry._id,
        _creationTime: entry._creationTime,
        title: entry.title,
        description: entry.description,
        url: entry.url,
        voteCount: entry.voteCount,
        rank: index + 1,
        // Emails are only exposed to event admins (for moderation).
        email: viewerIsAdmin ? entry.email : undefined,
        mine: viewerEmail !== null && entry.email === viewerEmail,
        voted: votedIds.has(entry._id),
      })),
    };
  },
});

async function requireParticipant(ctx: MutationCtx, slug: string) {
  const email = await verifiedEmail(ctx);
  if (!email) {
    throw new Error("Sign in with a verified email to join the showcase.");
  }
  const event = await eventBySlug(ctx, slug);
  if (!event) throw new Error("Event not found");
  if (event.showcaseOpen !== true) {
    throw new Error("The showcase isn't open for this event.");
  }
  if (!(await isAttendee(ctx, event._id, email))) {
    throw new Error("Only attendees of this event can take part in the showcase.");
  }
  return { email, event };
}

// One entry per attendee per event; resubmitting edits the existing entry.
export const submit = mutation({
  args: {
    slug: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { email, event } = await requireParticipant(ctx, args.slug);
    const title = args.title.trim().slice(0, TITLE_MAX);
    if (!title) throw new Error("Give your project a title");
    const description = args.description?.trim().slice(0, DESCRIPTION_MAX) || undefined;
    const url = normalizeUrl(args.url);

    const existing = await ctx.db
      .query("showcaseEntries")
      .withIndex("by_event_email", (q) =>
        q.eq("eventId", event._id).eq("email", email),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { title, description, url });
      return { entryId: existing._id, updated: true as const };
    }
    const entryId = await ctx.db.insert("showcaseEntries", {
      eventId: event._id,
      email,
      title,
      description,
      url,
      voteCount: 0,
    });
    await logAudit(ctx, {
      eventId: event._id,
      action: "showcase_entry_submitted",
      actorEmail: email,
      subjectEmail: email,
      details: title,
    });
    return { entryId, updated: false as const };
  },
});

// Casts or retracts a vote. Voters get MAX_VOTES_PER_VOTER per event and
// can't vote for their own entry.
export const toggleVote = mutation({
  args: { slug: v.string(), entryId: v.id("showcaseEntries") },
  handler: async (ctx, args) => {
    const { email, event } = await requireParticipant(ctx, args.slug);
    const entry = await ctx.db.get(args.entryId);
    if (!entry || entry.eventId !== event._id) {
      throw new Error("That project is no longer in the showcase.");
    }
    if (entry.email === email) {
      throw new Error("You can't vote for your own project.");
    }
    const existing = await ctx.db
      .query("showcaseVotes")
      .withIndex("by_entry_voter", (q) =>
        q.eq("entryId", entry._id).eq("voterEmail", email),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(entry._id, { voteCount: Math.max(0, entry.voteCount - 1) });
      return { voted: false as const };
    }
    const cast = await ctx.db
      .query("showcaseVotes")
      .withIndex("by_event_voter", (q) =>
        q.eq("eventId", event._id).eq("voterEmail", email),
      )
      .collect();
    if (cast.length >= MAX_VOTES_PER_VOTER) {
      throw new Error(
        `You've used all ${MAX_VOTES_PER_VOTER} votes — remove one to vote for something else.`,
      );
    }
    await ctx.db.insert("showcaseVotes", {
      eventId: event._id,
      entryId: entry._id,
      voterEmail: email,
    });
    await ctx.db.patch(entry._id, { voteCount: entry.voteCount + 1 });
    return { voted: true as const };
  },
});

export const setOpen = mutation({
  args: { eventId: v.id("events"), open: v.boolean() },
  handler: async (ctx, args) => {
    const adminEmail = await requireEventAdmin(ctx, args.eventId);
    await ctx.db.patch(args.eventId, { showcaseOpen: args.open || undefined });
    await logAudit(ctx, {
      eventId: args.eventId,
      action: args.open ? "showcase_opened" : "showcase_closed",
      actorEmail: adminEmail ?? undefined,
    });
    return null;
  },
});

async function deleteEntry(ctx: MutationCtx, entry: Doc<"showcaseEntries">) {
  const votes = await ctx.db
    .query("showcaseVotes")
    .withIndex("by_entry", (q) => q.eq("entryId", entry._id))
    .collect();
  await Promise.all(votes.map((vote) => ctx.db.delete(vote._id)));
  await ctx.db.delete(entry._id);
}

// Admin moderation, or an attendee withdrawing their own entry while the
// showcase is still open (closed standings are final).
export const remove = mutation({
  args: { entryId: v.id("showcaseEntries") },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) return null;
    const email = await verifiedEmail(ctx);
    if (entry.email !== email) {
      await requireEventAdmin(ctx, entry.eventId);
    } else if (!(await isEventAdmin(ctx, entry.eventId))) {
      const event = await ctx.db.get(entry.eventId);
      if (event?.showcaseOpen !== true) {
        throw new Error("The showcase has closed — entries can no longer be withdrawn.");
      }
    }
    await deleteEntry(ctx, entry);
    await logAudit(ctx, {
      eventId: entry.eventId,
      action: "showcase_entry_removed",
      actorEmail: email ?? undefined,
      subjectEmail: entry.email,
      details: entry.title,
    });
    return null;
  },
});

// Called from events.remove so showcase data doesn't outlive its event.
export async function deleteShowcaseForEvent(
  ctx: MutationCtx,
  eventId: Id<"events">,
) {
  const entries = await ctx.db
    .query("showcaseEntries")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  for (const entry of entries) await deleteEntry(ctx, entry);
}
