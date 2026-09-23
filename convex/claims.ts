import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { isEventAdmin, requireEventAdmin } from "./admins";
import { logAudit } from "./auditLog";
import { isBlacklisted } from "./blacklist";
import { blockValue } from "./blockValues";
import { dropTypeIfEmpty } from "./codes";
import { notExpired } from "./codeExpiry";
import { resolveViewer } from "./identity";

// Participant rows are keyed by the event's identity kind: a lowercased email
// or an "@handle" (see lib/attendee-identity.ts).
async function findParticipant(
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

// The unclaimed, unreserved, unexpired code an attendee would receive next,
// optionally restricted to one block.
async function nextAvailable(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
  requestedType: string | undefined
) {
  const codes =
    requestedType !== undefined
      ? ctx.db
          .query("codes")
          .withIndex("by_event_codeType_claimedBy", (q) =>
            q
              .eq("eventId", event._id)
              .eq("codeType", requestedType)
              .eq("claimedBy", undefined)
          )
      : ctx.db
          .query("codes")
          .withIndex("by_event_claimedBy", (q) =>
            q.eq("eventId", event._id).eq("claimedBy", undefined)
          );
  return await codes
    .filter(notExpired)
    .filter((q) => q.eq(q.field("reservedFor"), undefined))
    .first();
}

// Dynamic events have no pre-uploaded participant list: the first time a
// signed-in verified identity interacts with the event it is enrolled on the
// spot, so the usual per-attendee claim and instructions tracking applies.
// Blacklisted addresses are never enrolled.
async function findOrEnrollParticipant(
  ctx: MutationCtx,
  event: Doc<"events">,
  key: string
) {
  const existing = await findParticipant(ctx, event, key);
  if (existing || !event.dynamic) return existing;
  if (await isBlacklisted(ctx, key)) return null;
  const id = await ctx.db.insert("emails", { eventId: event._id, email: key });
  return await ctx.db.get(id);
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
    const allowed = key ? await findParticipant(ctx, event, key) : null;
    if (previewing) {
      const codeTypes = event.codeTypes ?? [];
      const options = codeTypes.length > 1 ? codeTypes : [undefined];
      const previewCodes = await Promise.all(
        options.map(async (codeType) => ({
          codeType,
          expiresAt: (await nextAvailable(ctx, event, codeType))?.expiresAt,
        }))
      );
      return {
        eligible: true as const,
        identity: key,
        instructionsViewed: false,
        preview: true as const,
        previewCodes,
      };
    }
    const walkUpEligible = event.dynamic && !(await isBlacklisted(ctx, key));
    if (!allowed && !walkUpEligible) {
      return { eligible: false as const, reason: "not_listed" as const, identity: key };
    }
    const claimed = await ctx.db
      .query("codes")
      .withIndex("by_event_claimedBy", (q) =>
        q.eq("eventId", event._id).eq("claimedBy", key)
      )
      .unique();
    const instructionsViewed = allowed?.instructionsViewedAt !== undefined;
    if (claimed) {
      return {
        eligible: true as const,
        identity: key,
        instructionsViewed,
        claimed: {
          code: claimed.code,
          codeType: claimed.codeType,
          creditAmount: blockValue(event, claimed.codeType),
          expiresAt: claimed.expiresAt,
        },
      };
    }
    return { eligible: true as const, identity: key, instructionsViewed };
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
  args: { slug: v.string(), codeType: v.optional(v.string()) },
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

    const allowed = await findOrEnrollParticipant(ctx, event, key);
    if (!allowed) {
      return {
        ok: false as const,
        error: event.dynamic
          ? `${key} is not eligible to claim a code for this event.`
          : viewer.kind === "x"
            ? `${key} is not on the participant list for this event. Sign in with the X account you registered with.`
            : `${key} is not on the participant list for this event. Sign in with the email you registered with.`,
      };
    }

    const alreadyClaimed = await ctx.db
      .query("codes")
      .withIndex("by_event_claimedBy", (q) =>
        q.eq("eventId", event._id).eq("claimedBy", key)
      )
      .unique();
    if (alreadyClaimed) {
      return {
        ok: true as const,
        code: alreadyClaimed.code,
        codeType: alreadyClaimed.codeType,
        alreadyClaimed: true,
        creditAmount: blockValue(event, alreadyClaimed.codeType),
        expiresAt: alreadyClaimed.expiresAt,
      };
    }

    if (event.claimInstructions && allowed.instructionsViewedAt === undefined) {
      return {
        ok: false as const,
        error: "Read the redemption instructions before claiming your code.",
      };
    }

    const requestedType = args.codeType?.trim() || undefined;

    // A code reserved for this attendee (via waitlist approval) takes priority;
    // otherwise take any unclaimed code that isn't reserved for someone else.
    const reserved = await ctx.db
      .query("codes")
      .withIndex("by_event_reservedFor", (q) =>
        q.eq("eventId", event._id).eq("reservedFor", key)
      )
      .filter(notExpired)
      .filter((q) => q.eq(q.field("claimedBy"), undefined))
      .first();
    const available =
      reserved ?? (await nextAvailable(ctx, event, requestedType));
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
      claimedAt: Date.now(),
      reservedFor: undefined,
    });
    return {
      ok: true as const,
      code: available.code,
      codeType: available.codeType,
      alreadyClaimed: false,
      creditAmount: blockValue(event, available.codeType),
      expiresAt: available.expiresAt,
    };
  },
});
