import { internalAction } from "./_generated/server";
import { v } from "convex/values";

// Sends the "you're approved" email via Resend. Requires RESEND_API_KEY (and
// optionally RESEND_FROM_EMAIL, SITE_URL) in the Convex deployment environment;
// without a key it logs and skips so approvals never fail on email delivery.
export const sendApprovalEmail = internalAction({
  args: {
    email: v.string(),
    eventName: v.string(),
    slug: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.log(
        `RESEND_API_KEY not set — skipping approval email to ${args.email} for ${args.eventName}`
      );
      return { sent: false as const };
    }
    const from =
      process.env.RESEND_FROM_EMAIL ?? "Vending Machine <onboarding@resend.dev>";
    const siteUrl = process.env.SITE_URL?.replace(/\/$/, "");
    const claimUrl = siteUrl ? `${siteUrl}/${args.slug}` : `/${args.slug}`;
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
        html: [
          `<p>Your access request for <strong>${args.eventName}</strong> was approved.</p>`,
          `<p>A credit code has been reserved for you. Sign in with this email address to claim it:</p>`,
          `<p><a href="${claimUrl}">${claimUrl}</a></p>`,
        ].join("\n"),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Resend API error (${res.status}): ${body}`);
      return { sent: false as const };
    }
    return { sent: true as const };
  },
});
