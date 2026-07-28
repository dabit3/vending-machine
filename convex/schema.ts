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
    eventUrl: v.optional(v.string()),
    eventDate: v.optional(v.string()),
  }).index("by_slug", ["slug"]),

  emails: defineTable({
    eventId: v.id("events"),
    email: v.string(),
  })
    .index("by_event", ["eventId"])
    .index("by_event_email", ["eventId", "email"]),

  codes: defineTable({
    eventId: v.id("events"),
    code: v.string(),
    claimedBy: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
  })
    .index("by_event", ["eventId"])
    .index("by_event_claimedBy", ["eventId", "claimedBy"])
    .index("by_claimedBy", ["claimedBy"]),
});
