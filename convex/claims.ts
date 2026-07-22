import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Every code the signed-in user has claimed, newest first, joined with the
// event it belongs to so the page can link back and show credit amounts.
export const myClaims = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const email = identity.email?.trim().toLowerCase();
    if (!email || identity.emailVerified !== true) return [];

    const codes = await ctx.db
      .query("codes")
      .withIndex("by_claimedBy", (q) => q.eq("claimedBy", email))
      .collect();

    const claims = await Promise.all(
      codes.map(async (code) => {
        const event = await ctx.db.get(code.eventId);
        if (!event) return null;
        return {
          _id: code._id,
          code: code.code,
          claimedAt: code.claimedAt,
          eventName: event.name,
          eventSlug: event.slug,
          creditAmount: event.creditAmount,
          eventDate: event.eventDate,
        };
      })
    );

    return claims
      .filter((claim) => claim !== null)
      .sort((a, b) => (b.claimedAt ?? 0) - (a.claimedAt ?? 0));
  },
});

export const claim = mutation({
  args: { slug: v.string() },
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
        alreadyClaimed: true,
        creditAmount: event.creditAmount,
      };
    }

    const available = await ctx.db
      .query("codes")
      .withIndex("by_event_claimedBy", (q) =>
        q.eq("eventId", event._id).eq("claimedBy", undefined)
      )
      .first();
    if (!available) {
      return {
        ok: false as const,
        error: "All codes for this event have been claimed.",
      };
    }

    await ctx.db.patch(available._id, {
      claimedBy: email,
      claimedAt: Date.now(),
    });
    return {
      ok: true as const,
      code: available.code,
      alreadyClaimed: false,
      creditAmount: event.creditAmount,
    };
  },
});
