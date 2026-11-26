import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { logAudit } from "./auditLog";

const MAX_ERROR_LENGTH = 300;
const RESEND_TIMEOUT_MS = 10_000;
const WEBHOOK_TIMEOUT_MS = 5_000;

function formatError(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, MAX_ERROR_LENGTH);
}

function parseWebhookUrl(raw?: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}

async function sendFailureWebhook(details: {
  email: string;
  eventName: string;
  eventSlug: string;
  error: string;
}) {
  const webhookUrl = parseWebhookUrl(process.env.ERROR_ALERT_WEBHOOK_URL);
  if (!webhookUrl) return;
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `[Try Devin] Approval email failed for ${details.email} (${details.eventName} /${details.eventSlug}): ${details.error}`,
        source: "convex:notifications.sendApprovalEmail",
        ...details,
      }),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(
        `Approval email alert webhook returned ${res.status} for ${details.email}`
      );
    }
  } catch (err) {
    console.error("Failed to send approval email alert webhook:", err);
  }
}

export const recordApprovalEmailOutcome = internalMutation({
  args: {
    eventId: v.optional(v.id("events")),
    requestId: v.optional(v.id("accessRequests")),
    email: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.requestId) {
      const request = await ctx.db.get(args.requestId);
      if (request) {
        await ctx.db.patch(request._id, {
          emailStatus: args.status,
          emailError: args.status === "failed" ? args.error : undefined,
        });
      }
    }
    if (args.status === "failed" && args.eventId) {
      await logAudit(ctx, {
        eventId: args.eventId,
        action: "approval_email_failed",
        subjectEmail: args.email,
        details: args.error,
      });
    }
  },
});

// Sends the approval email via Resend. Skips silently (with a console
// warning) when RESEND_API_KEY is not configured on the deployment, so
// approvals still work in environments without email set up. When Resend
// fails, records the failure in the audit log and on the access request,
// and posts to ERROR_ALERT_WEBHOOK_URL if configured.
export const sendApprovalEmail = internalAction({
  args: {
    eventId: v.optional(v.id("events")),
    requestId: v.optional(v.id("accessRequests")),
    email: v.string(),
    eventName: v.string(),
    eventSlug: v.string(),
    reserved: v.boolean(),
    alreadyClaimed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn(
        `RESEND_API_KEY not set, skipping approval email to ${args.email}`
      );
      return { sent: false as const, skipped: true as const };
    }
    const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
    const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
    const claimUrl = `${siteUrl}/${args.eventSlug}`;

    let failureReason: string | null = null;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [args.email],
          subject: `You're approved for ${args.eventName}`,
          text: args.reserved
            ? `Your access request for ${args.eventName} was approved. A credit code has been reserved for you.\n\nClaim it here: ${claimUrl}\n\nSign in with this email address (${args.email}) to dispense your code.`
            : args.alreadyClaimed
              ? `Your access request for ${args.eventName} was approved. You already have a credit code for this event.\n\nView it here: ${claimUrl}\n\nSign in with this email address (${args.email}) to see your code.`
              : `Your access request for ${args.eventName} was approved.\n\nVisit ${claimUrl} and sign in with this email address (${args.email}) to claim a code if one becomes available.`,
        }),
        signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        failureReason = formatError(
          body ? `HTTP ${res.status}: ${body}` : `HTTP ${res.status}`
        );
      }
    } catch (err) {
      failureReason = formatError(
        err instanceof Error ? err.message : String(err)
      );
    }

    if (failureReason) {
      console.error(
        JSON.stringify({
          event: "approval_email_failed",
          email: args.email,
          eventSlug: args.eventSlug,
          error: failureReason,
        })
      );
      await ctx.runMutation(internal.notifications.recordApprovalEmailOutcome, {
        eventId: args.eventId,
        requestId: args.requestId,
        email: args.email,
        status: "failed",
        error: failureReason,
      });
      await sendFailureWebhook({
        email: args.email,
        eventName: args.eventName,
        eventSlug: args.eventSlug,
        error: failureReason,
      });
      return { sent: false as const, error: failureReason };
    }

    await ctx.runMutation(internal.notifications.recordApprovalEmailOutcome, {
      eventId: args.eventId,
      requestId: args.requestId,
      email: args.email,
      status: "sent",
    });
    return { sent: true as const };
  },
});
