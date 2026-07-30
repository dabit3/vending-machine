import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireEventAdmin } from "./admins";
import { recordAudit } from "./auditLogs";

// Attendees not on the whitelist can ask for access; one request per
// event/email. Re-requesting after a denial reopens the same request.
export const request = mutation({
  args: { slug: v.string(), message: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { ok: false as const, error: "Sign in to request access." };
    }
    const email = identity.email?.trim().toLowerCase();
    if (!email || identity.emailVerified !== true) {
      return {
        ok: false as const,
        error:
          "Your account has no verified email address. Sign in with a verified email.",
      };
    }

    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!event) {
      return { ok: false as const, error: "Event not found." };
    }

    const whitelisted = await ctx.db
      .query("emails")
      .withIndex("by_event_email", (q) =>
        q.eq("eventId", event._id).eq("email", email)
      )
      .unique();
    if (whitelisted) {
      return {
        ok: false as const,
        error: "You already have access to this event — claim your code above.",
      };
    }

    const message = args.message?.trim().slice(0, 500) || undefined;
    const existing = await ctx.db
      .query("accessRequests")
      .withIndex("by_event_email", (q) =>
        q.eq("eventId", event._id).eq("email", email)
      )
      .unique();
    if (existing) {
      // A denied request can be reopened; so can an approved one whose
      // whitelist entry was later removed (caller is not whitelisted here).
      if (existing.status === "denied" || existing.status === "approved") {
        await ctx.db.patch(existing._id, {
          status: "pending",
          message,
          decidedBy: undefined,
          decidedAt: undefined,
        });
        await recordAudit(ctx, {
          eventId: event._id,
          actor: email,
          action: "request_resubmitted",
          subjectEmail: email,
          details: message,
        });
      }
      return { ok: true as const, status: "pending" as const };
    }

    await ctx.db.insert("accessRequests", {
      eventId: event._id,
      email,
      status: "pending",
      message,
    });
    await recordAudit(ctx, {
      eventId: event._id,
      actor: email,
      action: "request_submitted",
      subjectEmail: email,
      details: message,
    });
    return { ok: true as const, status: "pending" as const };
  },
});

// The signed-in attendee's own request for an event, for status display.
export const mine = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const email = identity.email?.trim().toLowerCase();
    if (!email || identity.emailVerified !== true) return null;

    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!event) return null;

    const request = await ctx.db
      .query("accessRequests")
      .withIndex("by_event_email", (q) =>
        q.eq("eventId", event._id).eq("email", email)
      )
      .unique();
    if (!request) return null;
    return {
      status: request.status,
      requestedAt: request._creationTime,
      decidedAt: request.decidedAt,
    };
  },
});

export const listByEvent = query({
  args: {
    eventId: v.id("events"),
    status: v.optional(
      v.union(v.literal("pending"), v.literal("approved"), v.literal("denied"))
    ),
  },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    if (args.status) {
      const status = args.status;
      return await ctx.db
        .query("accessRequests")
        .withIndex("by_event_status", (q) =>
          q.eq("eventId", args.eventId).eq("status", status)
        )
        .order("desc")
        .collect();
    }
    return await ctx.db
      .query("accessRequests")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .collect();
  },
});

export const pendingCount = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    const pending = await ctx.db
      .query("accessRequests")
      .withIndex("by_event_status", (q) =>
        q.eq("eventId", args.eventId).eq("status", "pending")
      )
      .collect();
    return pending.length;
  },
});

// Approval whitelists the email, reserves an unclaimed code for it, and
// notifies the attendee by email.
export const approve = mutation({
  args: { id: v.id("accessRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Request not found");
    const adminEmail = await requireEventAdmin(ctx, request.eventId);
    if (request.status !== "pending") {
      throw new Error(`Request was already ${request.status}`);
    }
    const event = await ctx.db.get(request.eventId);
    if (!event) throw new Error("Event not found");

    const whitelisted = await ctx.db
      .query("emails")
      .withIndex("by_event_email", (q) =>
        q.eq("eventId", request.eventId).eq("email", request.email)
      )
      .unique();
    if (!whitelisted) {
      await ctx.db.insert("emails", {
        eventId: request.eventId,
        email: request.email,
      });
    }

    // Skip reserving if the attendee already holds a code (e.g. they were
    // whitelisted manually and claimed while this request was pending).
    const alreadyClaimed = await ctx.db
      .query("codes")
      .withIndex("by_event_claimedBy", (q) =>
        q.eq("eventId", request.eventId).eq("claimedBy", request.email)
      )
      .first();
    let reservedCode: string | null = null;
    const alreadyReserved = await ctx.db
      .query("codes")
      .withIndex("by_event_reservedFor", (q) =>
        q.eq("eventId", request.eventId).eq("reservedFor", request.email)
      )
      .first();
    if (alreadyClaimed) {
      // Nothing to reserve; they already hold a code.
    } else if (alreadyReserved) {
      reservedCode = alreadyReserved.code;
    } else {
      const available = await ctx.db
        .query("codes")
        .withIndex("by_event_claimedBy", (q) =>
          q.eq("eventId", request.eventId).eq("claimedBy", undefined)
        )
        .filter((q) => q.eq(q.field("reservedFor"), undefined))
        .first();
      if (available) {
        await ctx.db.patch(available._id, { reservedFor: request.email });
        reservedCode = available.code;
      }
    }

    await ctx.db.patch(request._id, {
      status: "approved",
      decidedBy: adminEmail ?? undefined,
      decidedAt: Date.now(),
    });
    await recordAudit(ctx, {
      eventId: request.eventId,
      actor: adminEmail ?? "unknown",
      action: "request_approved",
      subjectEmail: request.email,
      details: alreadyClaimed
        ? "Whitelisted — already holds a claimed code"
        : reservedCode !== null
          ? "Whitelisted and code reserved"
          : "Whitelisted — no unreserved codes left to hold",
    });

    await ctx.scheduler.runAfter(0, internal.notifications.sendApprovalEmail, {
      email: request.email,
      eventName: event.name,
      slug: event.slug,
      outcome: alreadyClaimed
        ? ("already_claimed" as const)
        : reservedCode !== null
          ? ("reserved" as const)
          : ("none" as const),
    });

    return {
      codeReserved: reservedCode !== null,
      alreadyClaimed: alreadyClaimed !== null,
    };
  },
});

export const deny = mutation({
  args: { id: v.id("accessRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Request not found");
    const adminEmail = await requireEventAdmin(ctx, request.eventId);
    if (request.status !== "pending") {
      throw new Error(`Request was already ${request.status}`);
    }
    await ctx.db.patch(request._id, {
      status: "denied",
      decidedBy: adminEmail ?? undefined,
      decidedAt: Date.now(),
    });
    await recordAudit(ctx, {
      eventId: request.eventId,
      actor: adminEmail ?? "unknown",
      action: "request_denied",
      subjectEmail: request.email,
    });
  },
});
