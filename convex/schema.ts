import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  admins: defineTable({
    email: v.string(),
  }).index("by_email", ["email"]),

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
    // Hidden events are excluded from the public home page listing but
    // remain reachable via their claim URL.
    hidden: v.optional(v.boolean()),
    // Distinct code types in this event's pool ("" = unnamed), maintained by
    // codes.add/remove so availability checks don't scan the pool.
    codeTypes: v.optional(v.array(v.string())),
    // Optional free-text value per code block, keyed by type ("" = unnamed),
    // e.g. "100" or "Team plan". Rendered with a "$" prefix only when numeric.
    codeTypeValues: v.optional(v.record(v.string(), v.string())),
  }).index("by_slug", ["slug"]),

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

  // Live status board for swarm demo sessions. Each agent upserts its own
  // row keyed by its Devin session id; parentSessionId links the tree.
  swarmAgents: defineTable({
    sessionId: v.string(),
    name: v.string(),
    level: v.number(),
    parentSessionId: v.optional(v.string()),
    role: v.string(),
    status: v.string(),
    task: v.optional(v.string()),
    detail: v.optional(v.string()),
    eventsStocked: v.optional(v.number()),
    pagesQAd: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_session", ["sessionId"]),

  // Events created by swarm agents (always hidden), so QA agents can
  // discover slugs to verify without an admin identity.
  swarmEvents: defineTable({
    sessionId: v.string(),
    eventId: v.id("events"),
    slug: v.string(),
    name: v.string(),
    codeCount: v.number(),
  }).index("by_slug", ["slug"]),

  auditLogs: defineTable({
    eventId: v.id("events"),
    action: v.string(),
    actorEmail: v.optional(v.string()),
    subjectEmail: v.optional(v.string()),
    details: v.optional(v.string()),
  }).index("by_event", ["eventId"]),
});
