import { internalAction, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireEventAdmin } from "./admins";

// Attendees not on the whitelist can ask to be let in. One active request per
// email per event; a denied request can be re-submitted.
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
        error: "Your account has no verified email address.",
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
        error: "You are already on the participant list — claim your code.",
      };
    }

    const existing = await ctx.db
      .query("accessRequests")
      .withIndex("by_event_email", (q) =>
        q.eq("eventId", event._id).eq("email", email)
      )
      .collect();
    const active = existing.find(
      (r) => r.status === "pending" || r.status === "approved"
    );
    if (active) {
      return {
        ok: false as const,
        error:
          active.status === "pending"
            ? "You already have a pending request for this event."
            : "Your request was already approved — claim your code.",
      };
    }

    const message = args.message?.trim().slice(0, 500) || undefined;
    await ctx.db.insert("accessRequests", {
      eventId: event._id,
      email,
      message,
      status: "pending",
    });
    await ctx.db.insert("auditLogs", {
      eventId: event._id,
      action: "request_submitted",
      actor: email,
      subject: email,
      details: message,
    });
    return { ok: true as const };
  },
});

// Attendee-facing status of their own latest request for an event.
export const myRequest = query({
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

    const requests = await ctx.db
      .query("accessRequests")
      .withIndex("by_event_email", (q) =>
        q.eq("eventId", event._id).eq("email", email)
      )
      .collect();
    if (requests.length === 0) return null;
    const latest = requests.reduce((a, b) =>
      b._creationTime > a._creationTime ? b : a
    );
    return {
      status: latest.status,
      requestedAt: latest._creationTime,
      resolvedAt: latest.resolvedAt,
    };
  },
});

export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    const requests = await ctx.db
      .query("accessRequests")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    return requests.sort((a, b) => b._creationTime - a._creationTime);
  },
});

// Approval whitelists the email and reserves an unclaimed code for it, then
// notifies the attendee by email.
export const approve = mutation({
  args: { id: v.id("accessRequests") },
  handler: async (ctx, args) => {
    const req = await ctx.db.get(args.id);
    if (!req) throw new Error("Request not found");
    const adminEmail = await requireEventAdmin(ctx, req.eventId);
    if (req.status !== "pending") {
      throw new Error("Request has already been resolved");
    }

    const event = await ctx.db.get(req.eventId);
    if (!event) throw new Error("Event not found");

    const available = await ctx.db
      .query("codes")
      .withIndex("by_event_claimedBy", (q) =>
        q.eq("eventId", req.eventId).eq("claimedBy", undefined)
      )
      .collect();
    const free = available.find((c) => !c.reservedFor);
    if (!free) {
      throw new Error(
        "No unreserved codes left for this event — add more codes before approving."
      );
    }

    const whitelisted = await ctx.db
      .query("emails")
      .withIndex("by_event_email", (q) =>
        q.eq("eventId", req.eventId).eq("email", req.email)
      )
      .unique();
    if (!whitelisted) {
      await ctx.db.insert("emails", { eventId: req.eventId, email: req.email });
    }
    await ctx.db.patch(free._id, { reservedFor: req.email });
    await ctx.db.patch(req._id, {
      status: "approved",
      resolvedBy: adminEmail ?? undefined,
      resolvedAt: Date.now(),
    });
    await ctx.db.insert("auditLogs", {
      eventId: req.eventId,
      action: "request_approved",
      actor: adminEmail ?? "unknown",
      subject: req.email,
      details: "Whitelisted and reserved a code",
    });
    await ctx.scheduler.runAfter(0, internal.accessRequests.sendApprovalEmail, {
      to: req.email,
      eventName: event.name,
      slug: event.slug,
    });
  },
});

export const deny = mutation({
  args: { id: v.id("accessRequests") },
  handler: async (ctx, args) => {
    const req = await ctx.db.get(args.id);
    if (!req) throw new Error("Request not found");
    const adminEmail = await requireEventAdmin(ctx, req.eventId);
    if (req.status !== "pending") {
      throw new Error("Request has already been resolved");
    }
    await ctx.db.patch(req._id, {
      status: "denied",
      resolvedBy: adminEmail ?? undefined,
      resolvedAt: Date.now(),
    });
    await ctx.db.insert("auditLogs", {
      eventId: req.eventId,
      action: "request_denied",
      actor: adminEmail ?? "unknown",
      subject: req.email,
    });
  },
});

// Best-effort notification via Resend. Skips silently when RESEND_API_KEY is
// not configured so approvals never fail because of email delivery.
export const sendApprovalEmail = internalAction({
  args: { to: v.string(), eventName: v.string(), slug: v.string() },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.log(
        `RESEND_API_KEY not set — skipping approval email to ${args.to}`
      );
      return;
    }
    const from = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
    const siteUrl = process.env.SITE_URL ?? "";
    const claimUrl = siteUrl ? `${siteUrl}/${args.slug}` : `/${args.slug}`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: `You're in — access approved for ${args.eventName}`,
        html: `<p>Your access request for <strong>${args.eventName}</strong> was approved.</p><p>A credit code has been reserved for you. <a href="${claimUrl}">Claim it here</a> by signing in with this email address.</p>`,
      }),
    });
    if (!res.ok) {
      console.error(
        `Failed to send approval email to ${args.to}: ${res.status} ${await res.text()}`
      );
    }
  },
});
