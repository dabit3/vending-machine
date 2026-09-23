import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { AttendeeIdentity } from "../lib/attendee-identity";

export function eventIdentity(event: Doc<"events">): AttendeeIdentity {
  return event.identity ?? "email";
}

// The signed-in viewer's verified email, lowercased, or null.
export async function viewerEmail(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || identity.emailVerified !== true) return null;
  return identity.email?.trim().toLowerCase() || null;
}

// The "@handle" recorded for the signed-in viewer by xAccounts.sync, or null
// when they have no X account linked (or it hasn't been synced yet).
export async function viewerXHandle(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const account = await ctx.db
    .query("xAccounts")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  return account?.handle ?? null;
}

// Every identity key the viewer may hold, for cross-event lookups such as
// the home page and /my-codes.
export async function viewerIdentityKeys(ctx: QueryCtx | MutationCtx) {
  const keys: string[] = [];
  const email = await viewerEmail(ctx);
  if (email) keys.push(email);
  const handle = await viewerXHandle(ctx);
  if (handle) keys.push(handle);
  return keys;
}

export type ViewerResolution =
  | { ok: true; key: string; kind: AttendeeIdentity }
  | { ok: false; reason: "unauthenticated" | "unverified" | "no_x_account" };

// Resolves the key an event uses to recognize the signed-in viewer: their
// verified email for email events, their synced X handle for X events.
export async function resolveViewer(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">
): Promise<ViewerResolution> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return { ok: false, reason: "unauthenticated" };
  const kind = eventIdentity(event);
  if (kind === "x") {
    const handle = await viewerXHandle(ctx);
    return handle
      ? { ok: true, key: handle, kind }
      : { ok: false, reason: "no_x_account" };
  }
  const email = await viewerEmail(ctx);
  return email ? { ok: true, key: email, kind } : { ok: false, reason: "unverified" };
}
