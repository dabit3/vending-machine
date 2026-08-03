import { internalAction } from "./_generated/server";
import { v } from "convex/values";

// Sends the approval email via Resend. Skips silently (with a console
// warning) when RESEND_API_KEY is not configured on the deployment, so
// approvals still work in environments without email set up.
export const sendApprovalEmail = internalAction({
  args: {
    email: v.string(),
    eventName: v.string(),
    eventSlug: v.string(),
    reserved: v.boolean(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn(
        `RESEND_API_KEY not set — skipping approval email to ${args.email}`
      );
      return { sent: false as const };
    }
    const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
    const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
    const claimUrl = `${siteUrl}/${args.eventSlug}`;
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
          : `Your access request for ${args.eventName} was approved.\n\nVisit ${claimUrl} and sign in with this email address (${args.email}) to claim a code if one becomes available.`,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Failed to send approval email to ${args.email}: ${body}`);
      return { sent: false as const };
    }
    return { sent: true as const };
  },
});
