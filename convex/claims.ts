import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { isEventAdmin, requireEventAdmin } from "./admins";
import { logAudit } from "./auditLog";
import { isBlacklisted } from "./blacklist";
import { blockValue, isArchivedType } from "./blockValues";
import { codeTerms } from "./codeTerms";
import { claimHistory } from "./claimCooldown";
import { dropTypeIfEmpty } from "./codes";
import { notExpired } from "./codeExpiry";
import { resolveViewer } from "./identity";
import { canonicalIdentityKey } from "../lib/attendee-identity";
import { cleanClaimantName } from "../lib/claimant-name";
import { CLAIM_WINDOW_DAYS, formatClaimDate } from "../lib/claim-cooldown";
import {
  formatAllowedDomains,
  hasAllowedDomains,
  matchesAllowedDomain,
} from "../lib/allowed-domains";

// Participant rows are keyed by the event's identity kind: a lowercased email
// or an "@handle" (see lib/attendee-identity.ts). Includes blocked rows.
async function findParticipantRow(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
  key: string
) {
  return await ctx.db
    .query("emails")
    .withIndex("by_event_email", (q) =>
      q.eq("eventId", event._id).eq("email", key)
    )
    .unique();
}

// "all" mode: each attendee is owed one code from every open block.
function dispensesAll(event: Doc<"events">) {
  return event.claimMode === "all";
}

// The open blocks of an event (undefined = the unnamed pool), in the order
// the blocks were created. Legacy events without a stored list have one pool.
function openBlocks(event: Doc<"events">): (string | undefined)[] {
  if (event.archivedAt !== undefined) return [];
  return (event.codeTypes ?? [""])
    .filter((t) => !isArchivedType(event, t))
    .map((t) => t || undefined);
}

// Every code the attendee holds from this event, in block order. One code
// unless the event dispenses one per block.
async function claimedHere(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
  key: string
) {
  const rows = await ctx.db
    .query("codes")
    .withIndex("by_event_claimedBy", (q) =>
      q.eq("eventId", event._id).eq("claimedBy", key)
    )
    .collect();
  const order = event.codeTypes ?? [];
  const rank = (c: Doc<"codes">) => {
    const i = order.indexOf(c.codeType ?? "");
    return i === -1 ? order.length : i;
  };
  return rows.sort(
    (a, b) => rank(a) - rank(b) || a._creationTime - b._creationTime
  );
}

// Unclaimed codes held for the attendee by a waitlist approval.
async function reservedFor(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
  key: string
) {
  const rows = await ctx.db
    .query("codes")
    .withIndex("by_event_reservedFor", (q) =>
      q.eq("eventId", event._id).eq("reservedFor", key)
    )
    .filter(notExpired)
    .filter((q) => q.eq(q.field("claimedBy"), undefined))
    .collect();
  if (event.archivedAt !== undefined) return [];
  return rows.filter((c) => !isArchivedType(event, c.codeType));
}

// "all" mode: the code the attendee would get from one block, preferring
// one reserved for them.
async function nextForBlock(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
  block: string | undefined,
  reserved: Doc<"codes">[]
) {
  return (
    reserved.find((c) => block === undefined || c.codeType === block) ??
    (await nextAvailable(ctx, event, block))
  );
}

// Read-only counterpart of nextForBlock for queries, using the sentinel probe.
async function probeForBlock(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
  block: string | undefined,
  reserved: Doc<"codes">[]
) {
  return (
    reserved.find((c) => block === undefined || c.codeType === block) ??
    (await probeAvailable(ctx, event, block))
  );
}

async function describeCode(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
  code: Doc<"codes">
) {
  return {
    code: code.code,
    codeType: code.codeType,
    creditAmount: blockValue(event, code.codeType),
    terms: await codeTerms(ctx, code),
    expiresAt: code.expiresAt,
  };
}

// Highest-claimKey open code in one block (the "sentinel" subscribed to by
// read-only queries like events.getBySlug and claims.eligibility). Because
// mutations avoid claiming the sentinel until it is the last open code left,
// live viewers do not re-run their event subscription on every claim.
export async function probeBlockCode(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  codeType: string | undefined
): Promise<Doc<"codes"> | null> {
  return await ctx.db
    .query("codes")
    .withIndex("by_event_codeType_claimedBy_claimKey", (q) =>
      q
        .eq("eventId", eventId)
        .eq("codeType", codeType)
        .eq("claimedBy", undefined)
    )
    .order("desc")
    .filter(notExpired)
    .filter((q) => q.eq(q.field("reservedFor"), undefined))
    .first();
}

async function probeAnyCode(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  excludedTypes: string[]
): Promise<Doc<"codes"> | null> {
  return await ctx.db
    .query("codes")
    .withIndex("by_event_claimedBy_claimKey", (q) =>
      q.eq("eventId", eventId).eq("claimedBy", undefined)
    )
    .order("desc")
    .filter(notExpired)
    .filter((q) => q.eq(q.field("reservedFor"), undefined))
    .filter((q) =>
      q.and(
        ...excludedTypes.map((t) =>
          q.neq(q.field("codeType"), t === "" ? undefined : t)
        )
      )
    )
    .first();
}

// Detects when the same person has already claimed on a self-enrolling event
// (dynamic or company-domain) under a different raw key: either the same Clerk
// account (`userId`) with a changed email/handle, or an email alias with the
// same canonical address (+tag / Gmail dots). List events defer to the
// organizer's explicit participant list.
async function otherIdentityClaimedHere(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
  key: string,
  userId?: string
): Promise<"account" | "alias" | null> {
  if (!event.dynamic && !hasAllowedDomains(event)) return null;
  if (userId) {
    const byAccount = await ctx.db
      .query("codes")
      .withIndex("by_event_claimedByUserId", (q) =>
        q.eq("eventId", event._id).eq("claimedByUserId", userId)
      )
      .collect();
    if (byAccount.some((c) => c.claimedBy !== key)) {
      return "account";
    }
  }
  const canonical = canonicalIdentityKey(key);
  const byCanonical = await ctx.db
    .query("codes")
    .withIndex("by_event_claimedByCanonical", (q) =>
      q.eq("eventId", event._id).eq("claimedByCanonical", canonical)
    )
    .collect();
  if (byCanonical.some((c) => c.claimedBy !== key)) {
    return "alias";
  }
  if (canonical !== key) {
    const legacyBase = await ctx.db
      .query("codes")
      .withIndex("by_event_claimedBy", (q) =>
        q.eq("eventId", event._id).eq("claimedBy", canonical)
      )
      .first();
    if (legacyBase) {
      return "alias";
    }
  }
  return null;
}

// Read-only availability probe for queries (eligibility preview and pending
// blocks), reading the sentinel rather than competing with live claims.
export async function probeAvailable(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
  requestedType: string | undefined
): Promise<Doc<"codes"> | null> {
  if (event.archivedAt !== undefined) return null;
  if (requestedType !== undefined) {
    if (isArchivedType(event, requestedType)) return null;
    return await probeBlockCode(ctx, event._id, requestedType);
  }
  const archived = event.archivedCodeTypes ?? [];
  if (event.codeTypes) {
    for (const typeKey of event.codeTypes) {
      if (archived.includes(typeKey)) continue;
      const hit = await probeBlockCode(ctx, event._id, typeKey || undefined);
      if (hit) return hit;
    }
    return null;
  }
  return await probeAnyCode(ctx, event._id, archived);
}

// The unclaimed, unreserved, unexpired code a mutation will dispense next,
// optionally restricted to one block. Seeks from a random claimKey cursor so
// concurrent claims read disjoint index ranges and avoid write conflicts, and
// leaves the highest-claimKey sentinel untouched until it is the last open
// code in the block.
export async function nextAvailable(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
  requestedType: string | undefined,
  cursor: number = Math.random()
): Promise<Doc<"codes"> | null> {
  if (event.archivedAt !== undefined) return null;
  if (requestedType !== undefined) {
    if (isArchivedType(event, requestedType)) return null;
    return await pickBlockCode(ctx, event._id, requestedType, cursor);
  }
  const archived = event.archivedCodeTypes ?? [];
  if (event.codeTypes) {
    for (const typeKey of event.codeTypes) {
      if (archived.includes(typeKey)) continue;
      const hit = await pickBlockCode(
        ctx,
        event._id,
        typeKey || undefined,
        cursor
      );
      if (hit) return hit;
    }
    return null;
  }
  return await pickAnyCode(ctx, event._id, archived, cursor);
}

async function pickBlockCode(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  codeType: string | undefined,
  cursor: number
): Promise<Doc<"codes"> | null> {
  // Taking two rows guarantees forward[0] is strictly below the highest-
  // claimKey sentinel whenever at least two open codes exist at or above
  // cursor. If only the sentinel (or nothing) is at or above cursor, wrap
  // around below cursor and only dispense the sentinel when it is last.
  const forward = await ctx.db
    .query("codes")
    .withIndex("by_event_codeType_claimedBy_claimKey", (q) =>
      q
        .eq("eventId", eventId)
        .eq("codeType", codeType)
        .eq("claimedBy", undefined)
        .gte("claimKey", cursor)
    )
    .filter(notExpired)
    .filter((q) => q.eq(q.field("reservedFor"), undefined))
    .take(2);
  if (forward.length >= 2) return forward[0];
  const wrapped = await ctx.db
    .query("codes")
    .withIndex("by_event_codeType_claimedBy_claimKey", (q) =>
      q
        .eq("eventId", eventId)
        .eq("codeType", codeType)
        .eq("claimedBy", undefined)
        .lt("claimKey", cursor)
    )
    .filter(notExpired)
    .filter((q) => q.eq(q.field("reservedFor"), undefined))
    .first();
  return wrapped ?? forward[0] ?? null;
}

async function pickAnyCode(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  excludedTypes: string[],
  cursor: number
): Promise<Doc<"codes"> | null> {
  const notExcluded = (
    q: Parameters<
      Parameters<
        ReturnType<typeof ctx.db.query<"codes">>["filter"]
      >[0]
    >[0]
  ) =>
    q.and(
      ...excludedTypes.map((t) =>
        q.neq(q.field("codeType"), t === "" ? undefined : t)
      )
    );
  const forward = await ctx.db
    .query("codes")
    .withIndex("by_event_claimedBy_claimKey", (q) =>
      q.eq("eventId", eventId).eq("claimedBy", undefined).gte("claimKey", cursor)
    )
    .filter(notExpired)
    .filter((q) => q.eq(q.field("reservedFor"), undefined))
    .filter(notExcluded)
    .take(2);
  if (forward.length >= 2) return forward[0];
  const wrapped = await ctx.db
    .query("codes")
    .withIndex("by_event_claimedBy_claimKey", (q) =>
      q.eq("eventId", eventId).eq("claimedBy", undefined).lt("claimKey", cursor)
    )
    .filter(notExpired)
    .filter((q) => q.eq(q.field("reservedFor"), undefined))
    .filter(notExcluded)
    .first();
  return wrapped ?? forward[0] ?? null;
}

// Dynamic and domain-restricted events have no pre-uploaded participant list:
// the first time an eligible signed-in verified identity interacts with the
// event it is enrolled on the spot, so the usual per-attendee claim and
// instructions tracking applies. Blacklisted addresses are never eligible,
// even if already listed.
async function findOrEnrollParticipant(
  ctx: MutationCtx,
  event: Doc<"events">,
  key: string
) {
  if (await isBlacklisted(ctx, key)) return null;
  const domainRestricted = hasAllowedDomains(event);
  if (domainRestricted && !matchesAllowedDomain(key, event.allowedDomains)) {
    return null;
  }
  const existing = await findParticipantRow(ctx, event, key);
  if (existing) return existing.blockedAt === undefined ? existing : null;
  if (!event.dynamic && !domainRestricted) return null;
  const id = await ctx.db.insert("emails", {
    eventId: event._id,
    email: key,
    canonicalEmail: canonicalIdentityKey(key),
  });
  return await ctx.db.get(id);
}

// Organizers can waive the cross-event claim limit for a listed attendee.
function cooldownWaived(row: Doc<"emails"> | null) {
  return row?.cooldownWaivedAt !== undefined;
}

// Whether the signed-in viewer is on the participant list for the event,
// so the claim UI can hold back code options until eligibility is confirmed.
// With `preview`, event admins see the flow as a fresh eligible attendee
// (no claim on record, instructions unread); non-admins get normal behavior.
export const eligibility = query({
  args: { slug: v.string(), preview: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { eligible: false as const, reason: "unauthenticated" as const };
    }
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!event) {
      return { eligible: false as const, reason: "not_found" as const };
    }
    const previewing =
      args.preview === true && (await isEventAdmin(ctx, event._id));
    const viewer = await resolveViewer(ctx, event);
    // Admins can preview an X event without an X account of their own.
    if (!viewer.ok && !previewing) {
      return { eligible: false as const, reason: viewer.reason };
    }
    const key = viewer.ok ? viewer.key : "";
    const row = key ? await findParticipantRow(ctx, event, key) : null;
    const blocked = row?.blockedAt !== undefined;
    const allowed = row && !blocked ? row : null;
    if (previewing) {
      const codeTypes = (event.codeTypes ?? []).filter(
        (t) => !isArchivedType(event, t)
      );
      const options = codeTypes.length > 1 ? codeTypes : [undefined];
      const previewCodes = await Promise.all(
        options.map(async (codeType) => {
          const next = await probeAvailable(ctx, event, codeType);
          return {
            codeType,
            expiresAt: next?.expiresAt,
            terms: next ? await codeTerms(ctx, next) : undefined,
          };
        })
      );
      return {
        eligible: true as const,
        identity: key,
        instructionsViewed: false,
        preview: true as const,
        previewCodes,
      };
    }
    const domainRestricted = hasAllowedDomains(event);
    if (domainRestricted && !matchesAllowedDomain(key, event.allowedDomains)) {
      return {
        eligible: false as const,
        reason: "wrong_domain" as const,
        identity: key,
        allowedDomains: event.allowedDomains,
      };
    }
    if (await isBlacklisted(ctx, key)) {
      return { eligible: false as const, reason: "not_listed" as const, identity: key };
    }
    const walkUpEligible = (event.dynamic || domainRestricted) && !row;
    if (!allowed && !walkUpEligible) {
      return { eligible: false as const, reason: "not_listed" as const, identity: key };
    }
    const userId = viewer.ok ? viewer.userId : undefined;
    const claimedRows = await claimedHere(ctx, event, key);
    const instructionsViewed = allowed?.instructionsViewedAt !== undefined;
    if (claimedRows.length > 0) {
      const claimedCodes = await Promise.all(
        claimedRows.map((c) => describeCode(ctx, event, c))
      );
      // "all" mode: blocks the attendee has no code from yet that can
      // dispense one now (restocked, or added after they claimed).
      const pendingTypes: string[] = [];
      if (dispensesAll(event)) {
        const have = new Set(claimedRows.map((c) => c.codeType ?? ""));
        const reserved = await reservedFor(ctx, event, key);
        for (const block of openBlocks(event)) {
          if (have.has(block ?? "")) continue;
          if (await probeForBlock(ctx, event, block, reserved)) {
            pendingTypes.push(block ?? "");
          }
        }
      }
      return {
        eligible: true as const,
        identity: key,
        instructionsViewed,
        // First code, for claim pages loaded before events could dispense
        // several codes.
        claimed: claimedCodes[0],
        claimedCodes,
        pendingTypes,
      };
    }
    if (await otherIdentityClaimedHere(ctx, event, key, userId)) {
      return {
        eligible: false as const,
        reason: "not_listed" as const,
        identity: key,
      };
    }
    const cooldown = cooldownWaived(allowed)
      ? undefined
      : await claimHistory(ctx, key, userId);
    return {
      eligible: true as const,
      identity: key,
      instructionsViewed,
      cooldown:
        cooldown?.eligibleAt !== undefined
          ? { recent: cooldown.recent, eligibleAt: cooldown.eligibleAt }
          : undefined,
    };
  },
});

// Records that the signed-in attendee confirmed reading the redemption
// instructions, unlocking the claim UI for events that have instructions.
export const markInstructionsRead = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!event) return;
    const viewer = await resolveViewer(ctx, event);
    if (!viewer.ok) return;
    const claimedRows = await claimedHere(ctx, event, viewer.key);
    if (
      claimedRows.length === 0 &&
      (await otherIdentityClaimedHere(ctx, event, viewer.key, viewer.userId))
    ) {
      return;
    }
    const allowed = await findOrEnrollParticipant(ctx, event, viewer.key);
    if (!allowed || allowed.instructionsViewedAt !== undefined) return;
    await ctx.db.patch(allowed._id, { instructionsViewedAt: Date.now() });
  },
});

// Admin action: lets a participant claim again after an issue with their
// dispensed code. Deletes the code(s) they already claimed — the code may be
// broken or compromised, so it must not return to the pool — which clears the
// one-claim-per-attendee check in `claim`. `email` is the participant key:
// an email address or an "@handle".
export const allowReclaim = mutation({
  args: { eventId: v.id("events"), email: v.string() },
  handler: async (ctx, args) => {
    const actorEmail = await requireEventAdmin(ctx, args.eventId);
    const email = args.email.trim().toLowerCase();
    const claimed = await ctx.db
      .query("codes")
      .withIndex("by_event_claimedBy", (q) =>
        q.eq("eventId", args.eventId).eq("claimedBy", email)
      )
      .collect();
    if (claimed.length === 0) {
      throw new Error(`${email} has not claimed a code for this event.`);
    }
    for (const code of claimed) {
      await ctx.db.delete(code._id);
      await logAudit(ctx, {
        eventId: args.eventId,
        action: "allow_reclaim",
        actorEmail: actorEmail ?? undefined,
        subjectEmail: email,
        details: `Deleted claimed code ${code.code} so ${email} can claim again`,
      });
    }
    for (const codeType of new Set(claimed.map((c) => c.codeType))) {
      await dropTypeIfEmpty(ctx, args.eventId, codeType);
    }
    return { removed: claimed.length };
  },
});

export const claim = mutation({
  args: {
    slug: v.string(),
    codeType: v.optional(v.string()),
    name: v.optional(v.string()),
    // The attendee opened the redemption instructions with this claim.
    instructionsRead: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Codes are only dispensed to the signed-in user's verified identity
    // (their email, or for X events the handle Clerk reports for them), so
    // knowing someone else's registered email or handle is not enough to take
    // their code.
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!event) {
      return { ok: false as const, error: "Event not found." };
    }

    const viewer = await resolveViewer(ctx, event);
    if (!viewer.ok) {
      return {
        ok: false as const,
        error:
          viewer.reason === "unauthenticated"
            ? "Sign in to claim your code."
            : viewer.reason === "no_x_account"
              ? "This event dispenses codes by X handle. Sign in with X to claim."
              : "Your account has no verified email address. Sign in with the email you registered with.",
      };
    }
    const key = viewer.key;
    const userId = viewer.userId;
    const domainRestricted = hasAllowedDomains(event);
    const notEligibleError =
      domainRestricted && !matchesAllowedDomain(key, event.allowedDomains)
        ? `Only ${formatAllowedDomains(event.allowedDomains!)} email addresses can claim a code for this event. Sign in with your work email.`
        : event.dynamic || domainRestricted
          ? `${key} is not eligible to claim a code for this event.`
          : viewer.kind === "x"
            ? `${key} is not on the participant list for this event. Sign in with the X account you registered with.`
            : `${key} is not on the participant list for this event. Sign in with the email you registered with.`;

    if (domainRestricted && !matchesAllowedDomain(key, event.allowedDomains)) {
      return { ok: false as const, error: notEligibleError };
    }
    if (await isBlacklisted(ctx, key)) {
      return { ok: false as const, error: notEligibleError };
    }

    const all = dispensesAll(event);
    const claimedRows = await claimedHere(ctx, event, key);
    if (claimedRows.length === 0) {
      const duplicateKind = await otherIdentityClaimedHere(
        ctx,
        event,
        key,
        userId
      );
      if (duplicateKind === "account") {
        return {
          ok: false as const,
          error: "Your account has already claimed a code for this event.",
        };
      }
      if (duplicateKind === "alias") {
        return {
          ok: false as const,
          error:
            "A code for this event has already been claimed with this email address.",
        };
      }
    }

    const allowed = await findOrEnrollParticipant(ctx, event, key);
    if (!allowed) {
      return { ok: false as const, error: notEligibleError };
    }

    if (claimedRows.length > 0 && !all) {
      const codes = await Promise.all(
        claimedRows.map((c) => describeCode(ctx, event, c))
      );
      return { ok: true as const, ...codes[0], alreadyClaimed: true, codes };
    }

    // Collecting the rest of an event's codes is part of the same claim, so
    // the cross-event limit only applies to a first claim here.
    const cooldown =
      cooldownWaived(allowed) || claimedRows.length > 0
        ? undefined
        : await claimHistory(ctx, key, userId);
    if (cooldown?.eligibleAt !== undefined) {
      return {
        ok: false as const,
        error: `You already claimed codes at ${cooldown.recent} events in the past ${CLAIM_WINDOW_DAYS} days, so those credits should already be in your account. Your limit lifts on ${formatClaimDate(cooldown.eligibleAt)}.`,
      };
    }

    const firstRead =
      !!event.claimInstructions && allowed.instructionsViewedAt === undefined;
    if (firstRead && !args.instructionsRead) {
      return {
        ok: false as const,
        error: "Read the redemption instructions before claiming your code.",
      };
    }

    // Only dynamic and domain-restricted events ask for a name; list events
    // never show the field, so a name sent there is ignored rather than
    // written onto the list.
    const selfEnrolling = Boolean(event.dynamic || domainRestricted);
    const name = selfEnrolling ? cleanClaimantName(args.name) : undefined;
    if (selfEnrolling && !name && !allowed.name) {
      return {
        ok: false as const,
        error: "Enter your name to claim your code.",
      };
    }
    // Written only with a dispensed code: a claim refused for lack of stock
    // never opened the instructions, so they stay unread for the retry.
    const participantPatch = {
      ...(name && name !== allowed.name ? { name } : {}),
      ...(firstRead ? { instructionsViewedAt: Date.now() } : {}),
    };
    const recordClaim = async () => {
      if (Object.keys(participantPatch).length > 0) {
        await ctx.db.patch(allowed._id, participantPatch);
      }
    };

    const reserved = await reservedFor(ctx, event, key);

    if (all) {
      // One code from every open block the attendee has none from yet. A
      // block that is out of stock is skipped, not an error: they keep what
      // is available and can come back for the rest.
      const have = new Set(claimedRows.map((c) => c.codeType ?? ""));
      const dispensed: Doc<"codes">[] = [];
      for (const block of openBlocks(event)) {
        if (have.has(block ?? "")) continue;
        const next = await nextForBlock(ctx, event, block, reserved);
        if (!next) continue;
        await ctx.db.patch(next._id, {
          claimedBy: key,
          claimedByCanonical: canonicalIdentityKey(key),
          claimedByUserId: userId,
          claimedAt: Date.now(),
          reservedFor: undefined,
        });
        have.add(next.codeType ?? "");
        dispensed.push(next);
      }
      if (dispensed.length === 0 && claimedRows.length === 0) {
        return {
          ok: false as const,
          error: "All codes for this event have been claimed.",
        };
      }
      await recordClaim();
      const codes = await Promise.all(
        (await claimedHere(ctx, event, key)).map((c) =>
          describeCode(ctx, event, c)
        )
      );
      return {
        ok: true as const,
        ...codes[0],
        alreadyClaimed: dispensed.length === 0,
        codes,
      };
    }

    const requestedType = args.codeType?.trim() || undefined;

    // A code reserved for this attendee (via waitlist approval) takes priority;
    // otherwise take any unclaimed code that isn't reserved for someone else.
    const available =
      reserved[0] ?? (await nextAvailable(ctx, event, requestedType));
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
      claimedBy: key,
      claimedByCanonical: canonicalIdentityKey(key),
      claimedByUserId: userId,
      claimedAt: Date.now(),
      reservedFor: undefined,
    });
    await recordClaim();
    const code = await describeCode(ctx, event, available);
    return { ok: true as const, ...code, alreadyClaimed: false, codes: [code] };
  },
});
