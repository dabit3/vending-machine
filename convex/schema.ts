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
    creditAmount: v.optional(v.string()),
    eventDate: v.optional(v.string()),
    // Distinct code types in this event's pool ("" = unnamed), maintained by
    // codes.add/remove so availability checks don't scan the pool.
    codeTypes: v.optional(v.array(v.string())),
  }).index("by_slug", ["slug"]),

  emails: defineTable({
    eventId: v.id("events"),
    email: v.string(),
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

  auditLogs: defineTable({
    eventId: v.id("events"),
    action: v.string(),
    actorEmail: v.optional(v.string()),
    subjectEmail: v.optional(v.string()),
    details: v.optional(v.string()),
  }).index("by_event", ["eventId"]),
});
