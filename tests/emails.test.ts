import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { UPLOAD_CHUNK_SIZE } from "../lib/upload-limits";

const modules = import.meta.glob("../convex/**/*.ts");
const identity = {
  subject: "admin",
  email: "admin@example.com",
  emailVerified: true,
};

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("admins", { email: identity.email }));
  const admin = t.withIdentity(identity);
  const event = await admin.mutation(api.events.create, { name: "Meetup" });
  return { t, admin, event };
}

test("removeAll clears the eligible list, releases reservations and approvals, keeps claimed codes", async () => {
  const { t, admin, event } = await setup();
  await admin.mutation(api.emails.add, {
    eventId: event.id,
    emails: ["one@example.com", "two@example.com", "three@example.com"],
  });
  await admin.mutation(api.codes.add, {
    eventId: event.id,
    codes: ["A", "B", "C"],
  });
  await t.run(async (ctx) => {
    const [a, b] = await ctx.db
      .query("codes")
      .withIndex("by_event", (q) => q.eq("eventId", event.id))
      .collect();
    await ctx.db.patch(a._id, { claimedBy: "one@example.com" });
    await ctx.db.patch(b._id, { reservedFor: "two@example.com" });
    await ctx.db.insert("accessRequests", {
      eventId: event.id,
      email: "two@example.com",
      status: "approved",
    });
    await ctx.db.insert("accessRequests", {
      eventId: event.id,
      email: "three@example.com",
      status: "pending",
    });
  });

  expect(
    await admin.mutation(api.emails.removeAll, { eventId: event.id }),
  ).toEqual({ removed: 3, hasMore: false });

  expect(await admin.query(api.emails.list, { eventId: event.id })).toEqual([]);
  const codes = await admin.query(api.codes.list, { eventId: event.id });
  expect(codes).toHaveLength(3);
  expect(codes.find((c) => c.code === "A")?.claimedBy).toBe("one@example.com");
  expect(codes.find((c) => c.code === "B")?.reservedFor).toBeUndefined();
  const requests = await t.run((ctx) =>
    ctx.db
      .query("accessRequests")
      .withIndex("by_event", (q) => q.eq("eventId", event.id))
      .collect(),
  );
  expect(requests.map((r) => [r.email, r.status])).toEqual([
    ["three@example.com", "pending"],
  ]);
  const audit = await admin.query(api.auditLog.list, { eventId: event.id });
  expect(audit[0]).toMatchObject({
    action: "emails_removed_all",
    actorEmail: identity.email,
    details: "Removed 3 email(s)",
  });

  expect(
    await admin.mutation(api.emails.removeAll, { eventId: event.id }),
  ).toEqual({ removed: 0, hasMore: false });
});

test("removeAll clears large lists one chunk per call", async () => {
  const { t, admin, event } = await setup();
  const total = UPLOAD_CHUNK_SIZE + 2;
  await t.run(async (ctx) => {
    for (let i = 0; i < total; i++) {
      await ctx.db.insert("emails", {
        eventId: event.id,
        email: `user${i}@example.com`,
      });
    }
  });
  expect(
    await admin.mutation(api.emails.removeAll, { eventId: event.id }),
  ).toEqual({ removed: UPLOAD_CHUNK_SIZE, hasMore: true });
  expect(await admin.query(api.emails.list, { eventId: event.id })).toHaveLength(2);
  expect(
    await admin.mutation(api.emails.removeAll, { eventId: event.id }),
  ).toEqual({ removed: 2, hasMore: false });
  expect(await admin.query(api.emails.list, { eventId: event.id })).toEqual([]);
});

test("removeAll is scoped to the event and requires event admin access", async () => {
  const { t, admin, event } = await setup();
  const other = await admin.mutation(api.events.create, { name: "Other" });
  await admin.mutation(api.emails.add, {
    eventId: event.id,
    emails: ["one@example.com"],
  });
  await admin.mutation(api.emails.add, {
    eventId: other.id,
    emails: ["two@example.com"],
  });
  await t.run((ctx) =>
    ctx.db.insert("eventAdmins", {
      eventId: event.id,
      email: "organizer@example.com",
    }),
  );
  const organizer = t.withIdentity({
    subject: "organizer",
    email: "organizer@example.com",
    emailVerified: true,
  });
  await expect(
    organizer.mutation(api.emails.removeAll, { eventId: other.id }),
  ).rejects.toThrow("Not an admin for this event");
  await expect(
    t.mutation(api.emails.removeAll, { eventId: event.id }),
  ).rejects.toThrow();
  expect(
    await organizer.mutation(api.emails.removeAll, { eventId: event.id }),
  ).toEqual({ removed: 1, hasMore: false });
  expect(await admin.query(api.emails.list, { eventId: other.id })).toHaveLength(1);
});
