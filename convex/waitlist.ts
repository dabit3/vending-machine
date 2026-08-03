import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireEventAdmin } from "./admins";
import { logAudit } from "./auditLog";

// Attendees not on an event's whitelist can request access. Requests are
// keyed on the signed-in user's verified email, mirroring claims.claim.
export const requestAccess = mutation({
  args: { slug: v.string(), note: v.optional(v.string()) },
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
          "Your account has no verified email address. Sign in with a verified email to request access.",
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
        error: "You're already on the list for this event — claim your code.",
      };
    }

    const existing = await ctx.db
      .query("accessRequests")
      .withIndex("by_event_email", (q) =>
        q.eq("eventId", event._id).eq("email", email)
      )
      .unique();
    if (existing) {
      return { ok: true as const, status: existing.status, alreadyRequested: true };
    }

    const note = args.note?.trim().slice(0, 500) || undefined;
    await ctx.db.insert("accessRequests", {
      eventId: event._id,
      email,
      status: "pending",
      note,
    });
    await logAudit(ctx, {
      eventId: event._id,
      action: "request_submitted",
      actorEmail: email,
      subjectEmail: email,
      details: note,
    });
    return { ok: true as const, status: "pending" as const, alreadyRequested: false };
  },
});

// Lets a signed-in attendee check where their request stands for an event.
export const myRequest = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const email = identity?.email?.trim().toLowerCase();
    if (!email) return null;
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

export const listRequests = query({
  args: {
    eventId: v.id("events"),
    status: v.optional(
      v.union(v.literal("pending"), v.literal("approved"), v.literal("denied"))
    ),
  },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    if (args.status !== undefined) {
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

// Approval whitelists the requester and reserves an unclaimed code for them,
// then schedules the notification email.
export const approve = mutation({
  args: { requestId: v.id("accessRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    const adminEmail = await requireEventAdmin(ctx, request.eventId);
    if (request.status !== "pending") {
      throw new Error(`Request is already ${request.status}`);
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

    // Reserve the first unclaimed, unreserved code so the pool can't be
    // exhausted before the approved attendee gets a chance to claim.
    let reservedCode: string | undefined;
    const candidates = await ctx.db
      .query("codes")
      .withIndex("by_event_claimedBy", (q) =>
        q.eq("eventId", request.eventId).eq("claimedBy", undefined)
      )
      .collect();
    const available = candidates.find((c) => c.reservedFor === undefined);
    if (available) {
      await ctx.db.patch(available._id, { reservedFor: request.email });
      reservedCode = available.code;
    }

    await ctx.db.patch(request._id, {
      status: "approved",
      decidedBy: adminEmail ?? undefined,
      decidedAt: Date.now(),
    });
    await logAudit(ctx, {
      eventId: request.eventId,
      action: "request_approved",
      actorEmail: adminEmail ?? undefined,
      subjectEmail: request.email,
      details: reservedCode
        ? "Whitelisted and reserved a code"
        : "Whitelisted — no unreserved codes left to reserve",
    });

    await ctx.scheduler.runAfter(0, internal.notifications.sendApprovalEmail, {
      email: request.email,
      eventName: event.name,
      eventSlug: event.slug,
    });

    return { reserved: reservedCode !== undefined };
  },
});

export const deny = mutation({
  args: { requestId: v.id("accessRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    const adminEmail = await requireEventAdmin(ctx, request.eventId);
    if (request.status !== "pending") {
      throw new Error(`Request is already ${request.status}`);
    }
    await ctx.db.patch(request._id, {
      status: "denied",
      decidedBy: adminEmail ?? undefined,
      decidedAt: Date.now(),
    });
    await logAudit(ctx, {
      eventId: request.eventId,
      action: "request_denied",
      actorEmail: adminEmail ?? undefined,
      subjectEmail: request.email,
    });
    return null;
  },
});
