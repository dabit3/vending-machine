import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Whether the signed-in viewer is on the participant list for the event,
// so the claim UI can hold back code options until eligibility is confirmed.
export const eligibility = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { eligible: false as const, reason: "unauthenticated" as const };
    }
    const email = identity.email?.trim().toLowerCase();
    if (!email || identity.emailVerified !== true) {
      return { eligible: false as const, reason: "unverified" as const };
    }
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!event) {
      return { eligible: false as const, reason: "not_found" as const };
    }
    const allowed = await ctx.db
      .query("emails")
      .withIndex("by_event_email", (q) =>
        q.eq("eventId", event._id).eq("email", email)
      )
      .unique();
    if (!allowed) {
      return { eligible: false as const, reason: "not_listed" as const, email };
    }
    const claimed = await ctx.db
      .query("codes")
      .withIndex("by_event_claimedBy", (q) =>
        q.eq("eventId", event._id).eq("claimedBy", email)
      )
      .unique();
    const instructionsViewed = allowed.instructionsViewedAt !== undefined;
    if (claimed) {
      return {
        eligible: true as const,
        email,
        instructionsViewed,
        claimed: {
          code: claimed.code,
          codeType: claimed.codeType,
          creditAmount: event.creditAmount,
        },
      };
    }
    return { eligible: true as const, email, instructionsViewed };
  },
});

// Records that the signed-in attendee confirmed reading the redemption
// instructions, unlocking the claim UI for events that have instructions.
export const markInstructionsRead = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;
    const email = identity.email?.trim().toLowerCase();
    if (!email || identity.emailVerified !== true) return;
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!event) return;
    const allowed = await ctx.db
      .query("emails")
      .withIndex("by_event_email", (q) =>
        q.eq("eventId", event._id).eq("email", email)
      )
      .unique();
    if (!allowed || allowed.instructionsViewedAt !== undefined) return;
    await ctx.db.patch(allowed._id, { instructionsViewedAt: Date.now() });
  },
});

export const claim = mutation({
  args: { slug: v.string(), codeType: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // Codes are only dispensed to the signed-in user's verified email, so
    // knowing someone else's registered address is not enough to take their code.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { ok: false as const, error: "Sign in to claim your code." };
    }
    const email = identity.email?.trim().toLowerCase();
    if (!email || identity.emailVerified !== true) {
      return {
        ok: false as const,
        error:
          "Your account has no verified email address. Sign in with the email you registered with.",
      };
    }

    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!event) {
      return { ok: false as const, error: "Event not found." };
    }

    const allowed = await ctx.db
      .query("emails")
      .withIndex("by_event_email", (q) =>
        q.eq("eventId", event._id).eq("email", email)
      )
      .unique();
    if (!allowed) {
      return {
        ok: false as const,
        error: `${email} is not on the participant list for this event. Sign in with the email you registered with.`,
      };
    }

    const alreadyClaimed = await ctx.db
      .query("codes")
      .withIndex("by_event_claimedBy", (q) =>
        q.eq("eventId", event._id).eq("claimedBy", email)
      )
      .unique();
    if (alreadyClaimed) {
      return {
        ok: true as const,
        code: alreadyClaimed.code,
        codeType: alreadyClaimed.codeType,
        alreadyClaimed: true,
        creditAmount: event.creditAmount,
      };
    }

    if (event.claimInstructions && allowed.instructionsViewedAt === undefined) {
      return {
        ok: false as const,
        error: "Read the redemption instructions before claiming your code.",
      };
    }

    const requestedType = args.codeType?.trim() || undefined;

    // A code reserved for this email (via waitlist approval) takes priority;
    // otherwise take any unclaimed code that isn't reserved for someone else.
    const reserved = await ctx.db
      .query("codes")
      .withIndex("by_event_reservedFor", (q) =>
        q.eq("eventId", event._id).eq("reservedFor", email)
      )
      .filter((q) => q.eq(q.field("claimedBy"), undefined))
      .first();
    const unclaimed = reserved
      ? null
      : requestedType !== undefined
        ? await ctx.db
            .query("codes")
            .withIndex("by_event_codeType_claimedBy", (q) =>
              q
                .eq("eventId", event._id)
                .eq("codeType", requestedType)
                .eq("claimedBy", undefined)
            )
            .filter((q) => q.eq(q.field("reservedFor"), undefined))
            .first()
        : await ctx.db
            .query("codes")
            .withIndex("by_event_claimedBy", (q) =>
              q.eq("eventId", event._id).eq("claimedBy", undefined)
            )
            .filter((q) => q.eq(q.field("reservedFor"), undefined))
            .first();
    const available = reserved ?? unclaimed;
    if (!available) {
      return {
        ok: false as const,
        error:
          requestedType !== undefined
            ? `All "${requestedType}" codes for this event have been claimed.`
            : "All codes for this event have been claimed.",
      };
    }

    await ctx.db.patch(available._id, {
      claimedBy: email,
      claimedAt: Date.now(),
      reservedFor: undefined,
    });
    return {
      ok: true as const,
      code: available.code,
      codeType: available.codeType,
      alreadyClaimed: false,
      creditAmount: event.creditAmount,
    };
  },
});
