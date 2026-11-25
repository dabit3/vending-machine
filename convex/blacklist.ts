import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { adminEmailStatus, requireAdmin, requireEventAdmin } from "./admins";
import {
  canonicalIdentityKey,
  normalizeEmail,
  normalizeXHandle,
} from "../lib/attendee-identity";

// Canonical keys for legacy blacklist rows created before `canonicalEmail`
// was stored. Callers that check many addresses in a loop (bulk uploads,
// paginated cooldowns) fetch this set once and pass it into `isBlacklisted`.
export async function legacyBlacklistedCanonicals(
  ctx: QueryCtx | MutationCtx
): Promise<Set<string>> {
  const legacyRows = await ctx.db
    .query("blacklistedEmails")
    .withIndex("by_canonicalEmail", (q) => q.eq("canonicalEmail", undefined))
    .collect();
  return new Set(legacyRows.map((row) => canonicalIdentityKey(row.email)));
}

// App-wide blacklist managed exclusively by global admins. Blacklisted
// identities (email addresses or "@handle" X handles) are rejected whenever
// they would be added to any event or attempt to claim / request access.
// Matches both exact stored keys and canonical email forms (ignoring +tag
// subaddresses and Gmail dots) so legacy rows and aliases are all enforced.
export async function isBlacklisted(
  ctx: QueryCtx | MutationCtx,
  email: string,
  legacyCanonicals?: Set<string>
) {
  const exact = await ctx.db
    .query("blacklistedEmails")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  if (exact) return true;
  const canonical = canonicalIdentityKey(email);
  if (canonical !== email) {
    const legacyCanonical = await ctx.db
      .query("blacklistedEmails")
      .withIndex("by_email", (q) => q.eq("email", canonical))
      .first();
    if (legacyCanonical) return true;
  }
  const byCanonical = await ctx.db
    .query("blacklistedEmails")
    .withIndex("by_canonicalEmail", (q) => q.eq("canonicalEmail", canonical))
    .first();
  if (byCanonical) return true;
  const legacy = legacyCanonicals ?? (await legacyBlacklistedCanonicals(ctx));
  return legacy.has(canonical);
}

// Records that a blacklisted address was rejected while being added to an
// event, so event admins can see which uploaded emails were blocked.
export async function recordBlacklistHit(
  ctx: MutationCtx,
  eventId: Id<"events">,
  email: string
) {
  const existing = await ctx.db
    .query("blacklistHits")
    .withIndex("by_event_email", (q) =>
      q.eq("eventId", eventId).eq("email", email)
    )
    .unique();
  if (!existing) {
    await ctx.db.insert("blacklistHits", { eventId, email });
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("blacklistedEmails").collect();
  },
});

export const add = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const raw = args.email.trim();
    const email = raw.startsWith("@")
      ? normalizeXHandle(raw)
      : normalizeEmail(raw);
    if (!email) {
      throw new Error("Enter a valid email address or @handle");
    }
    if (await isBlacklisted(ctx, email)) {
      throw new Error(`${email} is already blacklisted`);
    }
    const canonical = canonicalIdentityKey(email);
    const { email: actorEmail } = await adminEmailStatus(ctx);
    await ctx.db.insert("blacklistedEmails", {
      email,
      canonicalEmail: canonical,
      addedBy: actorEmail ?? undefined,
    });
    // Pending duplicate-review flags for the address (or any canonical alias)
    // can never be approved now, so convert them into per-event blacklist
    // rejections.
    const pendingFlags = new Map<Id<"flaggedEmails">, Doc<"flaggedEmails">>();
    const flagKeys = canonical === email ? [email] : [email, canonical];
    for (const flagKey of flagKeys) {
      for (const flag of await ctx.db
        .query("flaggedEmails")
        .withIndex("by_email", (q) => q.eq("email", flagKey))
        .collect()) {
        pendingFlags.set(flag._id, flag);
      }
    }
    for (const flag of await ctx.db
      .query("flaggedEmails")
      .withIndex("by_canonicalEmail", (q) => q.eq("canonicalEmail", canonical))
      .collect()) {
      pendingFlags.set(flag._id, flag);
    }
    for (const flag of pendingFlags.values()) {
      await ctx.db.delete(flag._id);
      await recordBlacklistHit(ctx, flag.eventId, flag.email);
    }
    // Release any unclaimed code reservations held for this identity (or its
    // canonical aliases) so codes are not locked away for a blacklisted user.
    const listedRows = new Map<Id<"emails">, Doc<"emails">>();
    for (const row of await ctx.db
      .query("emails")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect()) {
      listedRows.set(row._id, row);
    }
    if (canonical !== email) {
      for (const row of await ctx.db
        .query("emails")
        .withIndex("by_email", (q) => q.eq("email", canonical))
        .collect()) {
        listedRows.set(row._id, row);
      }
    }
    for (const row of await ctx.db
      .query("emails")
      .withIndex("by_canonicalEmail", (q) => q.eq("canonicalEmail", canonical))
      .collect()) {
      listedRows.set(row._id, row);
    }
    for (const row of listedRows.values()) {
      const reserved = await ctx.db
        .query("codes")
        .withIndex("by_event_reservedFor", (q) =>
          q.eq("eventId", row.eventId).eq("reservedFor", row.email)
        )
        .filter((q) => q.eq(q.field("claimedBy"), undefined))
        .collect();
      for (const code of reserved) {
        await ctx.db.patch(code._id, { reservedFor: undefined });
      }
    }
  },
});

export const remove = mutation({
  args: { id: v.id("blacklistedEmails") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const entry = await ctx.db.get(args.id);
    if (!entry) return;
    await ctx.db.delete(args.id);
    // Clear the rejection records so events stop showing the address as
    // blacklisted once it's off the list.
    const hits = await ctx.db
      .query("blacklistHits")
      .withIndex("by_email", (q) => q.eq("email", entry.email))
      .collect();
    for (const hit of hits) {
      await ctx.db.delete(hit._id);
    }
  },
});

// Blacklisted addresses rejected while being added to this event.
export const listHits = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireEventAdmin(ctx, args.eventId);
    return await ctx.db
      .query("blacklistHits")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
  },
});
