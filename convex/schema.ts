import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  admins: defineTable({
    email: v.string(),
  }).index("by_email", ["email"]),

  stripeBatches: defineTable({
    name: v.string(),
    prefix: v.string(),
    amountCents: v.number(),
    quantity: v.number(),
    redemptionsPerCode: v.optional(v.union(v.literal(1), v.literal(2))),
    expiresAt: v.optional(v.number()),
    live: v.boolean(),
    createdBy: v.string(),
    requestId: v.string(),
    requestFingerprint: v.string(),
    status: v.union(v.literal("queued"), v.literal("running"), v.literal("failed"), v.literal("complete")),
    version: v.number(),
    seed: v.optional(v.string()),
    keyFingerprint: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    couponId: v.optional(v.string()),
    codes: v.array(v.object({ id: v.string(), code: v.string() })),
    error: v.optional(v.string()),
    targetEventId: v.optional(v.id("events")),
    eventId: v.optional(v.id("events")),
    codeType: v.optional(v.string()),
    attachedBy: v.optional(v.string()),
    attachedAt: v.optional(v.number()),
  })
    .index("by_creator_request", ["createdBy", "requestId"])
    .index("by_creator", ["createdBy"])
    .index("by_status", ["status"])
    .index("by_target_event", ["targetEventId"]),

  eventAdmins: defineTable({
    eventId: v.id("events"),
    email: v.string(),
  })
    .index("by_event", ["eventId"])
    .index("by_email", ["email"])
    .index("by_event_email", ["eventId", "email"]),

  events: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    // Legacy event-wide value; superseded by per-block codeTypeValues.
    creditAmount: v.optional(v.string()),
    eventDate: v.optional(v.string()),
    // Optional post-claim redemption instructions shown to attendees.
    claimInstructions: v.optional(v.string()),
    // Legacy: events used to be listed on the home page unless hidden. No
    // event is listed publicly anymore, so this flag is no longer read.
    hidden: v.optional(v.boolean()),
    // Dynamic events skip the participant list: any signed-in verified email
    // can claim, and is recorded in `emails` on first contact so it can only
    // claim once.
    dynamic: v.optional(v.boolean()),
    // How attendees are identified: verified email (default when absent) or
    // the X handle linked to their account. Participant and claim rows for
    // "x" events store "@handle" keys in the same fields emails use.
    identity: v.optional(v.union(v.literal("email"), v.literal("x"))),
    // X events only: organizer-written Markdown shown to signed-out visitors
    // on the claim page in place of the default "sign in with X" hint.
    signInMessage: v.optional(v.string()),
    // Normalized email of the admin who created the event; absent on events
    // created before it was recorded.
    createdBy: v.optional(v.string()),
    // Distinct code types in this event's pool ("" = unnamed), maintained by
    // codes.add/remove so availability checks don't scan the pool.
    codeTypes: v.optional(v.array(v.string())),
    // Optional free-text value per code block, keyed by type ("" = unnamed),
    // e.g. "100" or "Team plan". Rendered with a "$" prefix only when numeric.
    codeTypeValues: v.optional(v.record(v.string(), v.string())),
  }).index("by_slug", ["slug"]),

  // The X handle Clerk reports for a user, copied server-side from Clerk's
  // Backend API so a claim can never rely on a handle typed in the browser.
  xAccounts: defineTable({
    clerkUserId: v.string(),
    handle: v.string(),
    syncedAt: v.number(),
  })
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_handle", ["handle"]),

  emails: defineTable({
    eventId: v.id("events"),
    email: v.string(),
    // When the attendee confirmed reading the redemption instructions,
    // required once (per event) before claiming when instructions exist.
    instructionsViewedAt: v.optional(v.number()),
  })
    .index("by_event", ["eventId"])
    .index("by_event_email", ["eventId", "email"])
    .index("by_email", ["email"]),

  blacklistedEmails: defineTable({
    email: v.string(),
    addedBy: v.optional(v.string()),
  }).index("by_email", ["email"]),

  blacklistHits: defineTable({
    eventId: v.id("events"),
    email: v.string(),
  })
    .index("by_event", ["eventId"])
    .index("by_event_email", ["eventId", "email"])
    .index("by_email", ["email"]),

  flaggedEmails: defineTable({
    eventId: v.id("events"),
    email: v.string(),
    matchedEventIds: v.array(v.id("events")),
  })
    .index("by_event", ["eventId"])
    .index("by_event_email", ["eventId", "email"])
    .index("by_email", ["email"]),

  codes: defineTable({
    eventId: v.id("events"),
    code: v.string(),
    expiresAt: v.optional(v.number()),
    codeType: v.optional(v.string()),
    claimedBy: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    reservedFor: v.optional(v.string()),
  })
    .index("by_event", ["eventId"])
    .index("by_event_claimedBy", ["eventId", "claimedBy"])
    .index("by_event_codeType_claimedBy", ["eventId", "codeType", "claimedBy"])
    .index("by_event_reservedFor", ["eventId", "reservedFor"])
    .index("by_claimedBy", ["claimedBy"]),

  accessRequests: defineTable({
    eventId: v.id("events"),
    email: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied")
    ),
    note: v.optional(v.string()),
    decidedBy: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
  })
    .index("by_event", ["eventId"])
    .index("by_event_status", ["eventId", "status"])
    .index("by_event_email", ["eventId", "email"])
    .index("by_email", ["email"]),

  auditLogs: defineTable({
    eventId: v.id("events"),
    action: v.string(),
    actorEmail: v.optional(v.string()),
    subjectEmail: v.optional(v.string()),
    details: v.optional(v.string()),
  }).index("by_event", ["eventId"]),
});
