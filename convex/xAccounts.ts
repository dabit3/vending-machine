import { action, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { normalizeXHandle } from "../lib/attendee-identity";
import { viewerXHandle } from "./identity";

// Clerk's Backend API names OAuth providers "oauth_<provider>"; X appears as
// "oauth_x" (X/Twitter v2) or "oauth_twitter" (the legacy v1 connection).
const X_PROVIDERS = new Set(["x", "twitter"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Picks the verified X handle out of a Clerk Backend API user object
// (`GET /v1/users/{id}`), whose `external_accounts` carry `provider`,
// `username` and `verification.status`.
export function xHandleFromClerkUser(user: unknown): string | null {
  if (!isRecord(user) || !Array.isArray(user.external_accounts)) return null;
  for (const account of user.external_accounts) {
    if (!isRecord(account)) continue;
    const { provider, username, verification } = account;
    if (typeof provider !== "string") continue;
    if (!X_PROVIDERS.has(provider.replace(/^oauth_/, ""))) continue;
    if (!isRecord(verification) || verification.status !== "verified") continue;
    if (typeof username !== "string") continue;
    const handle = normalizeXHandle(username);
    if (handle) return handle;
  }
  return null;
}

// Refreshes the signed-in user's X handle from Clerk. The browser never
// supplies the handle: the Clerk user id comes from the verified Convex token
// and the handle from Clerk's Backend API, so a claim keyed on it is as
// trustworthy as one keyed on a verified email.
export const sync = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { ok: false as const, reason: "unauthenticated" as const };
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) {
      console.error(
        "CLERK_SECRET_KEY is not set on the Convex deployment; X handles cannot be synced."
      );
      return { ok: false as const, reason: "not_configured" as const };
    }
    const res = await fetch(
      `https://api.clerk.com/v1/users/${encodeURIComponent(identity.subject)}`,
      { headers: { Authorization: `Bearer ${secret}` } }
    );
    if (!res.ok) {
      console.error(`Clerk user lookup failed with HTTP ${res.status}`);
      return { ok: false as const, reason: "lookup_failed" as const };
    }
    const handle = xHandleFromClerkUser(await res.json());
    await ctx.runMutation(internal.xAccounts.store, {
      clerkUserId: identity.subject,
      handle: handle ?? undefined,
    });
    return { ok: true as const, handle };
  },
});

export const store = internalMutation({
  args: { clerkUserId: v.string(), handle: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("xAccounts")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    const handle = args.handle;
    if (handle === undefined) {
      if (existing) await ctx.db.delete(existing._id);
      return;
    }
    // A handle can belong to one Clerk user at a time: if it was previously
    // synced for another user (the X account was re-linked elsewhere), that
    // stale row goes so it can't be used to claim twice.
    const holders = await ctx.db
      .query("xAccounts")
      .withIndex("by_handle", (q) => q.eq("handle", handle))
      .collect();
    for (const holder of holders) {
      if (holder.clerkUserId !== args.clerkUserId) await ctx.db.delete(holder._id);
    }
    if (existing) {
      await ctx.db.patch(existing._id, { handle, syncedAt: Date.now() });
    } else {
      await ctx.db.insert("xAccounts", {
        clerkUserId: args.clerkUserId,
        handle,
        syncedAt: Date.now(),
      });
    }
  },
});

// The viewer's synced handle, for the claim page's "signed in as" line.
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return { handle: await viewerXHandle(ctx) };
  },
});
