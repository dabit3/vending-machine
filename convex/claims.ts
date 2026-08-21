import { mutation } from "./_generated/server";
import { v } from "convex/values";

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
      : await ctx.db
          .query("codes")
          .withIndex("by_event_claimedBy", (q) =>
            q.eq("eventId", event._id).eq("claimedBy", undefined)
          )
          .filter((q) =>
            requestedType !== undefined
              ? q.and(
                  q.eq(q.field("reservedFor"), undefined),
                  q.eq(q.field("codeType"), requestedType)
                )
              : q.eq(q.field("reservedFor"), undefined)
          )
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
