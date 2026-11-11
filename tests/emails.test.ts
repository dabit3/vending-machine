import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
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

async function withOrganizer(t: ReturnType<typeof convexTest>, eventId: Id<"events">) {
  await t.run((ctx) =>
    ctx.db.insert("eventAdmins", { eventId, email: "organizer@example.com" }),
  );
  return t.withIdentity({
    subject: "organizer",
    email: "organizer@example.com",
    emailVerified: true,
  });
}

test("removeAll is scoped to the event and requires system admin access", async () => {
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
  const organizer = await withOrganizer(t, event.id);
  await expect(
    organizer.mutation(api.emails.removeAll, { eventId: event.id }),
  ).rejects.toThrow("Not an admin");
  await expect(
    t.mutation(api.emails.removeAll, { eventId: event.id }),
  ).rejects.toThrow();
  expect(await admin.query(api.emails.list, { eventId: event.id })).toHaveLength(1);
  expect(
    await admin.mutation(api.emails.removeAll, { eventId: event.id }),
  ).toEqual({ removed: 1, hasMore: false });
  expect(await admin.query(api.emails.list, { eventId: other.id })).toHaveLength(1);
});

test("event admins can delete participants only on events they manage", async () => {
  const { t, admin, event } = await setup();
  const other = await admin.mutation(api.events.create, { name: "Other" });
  await admin.mutation(api.emails.add, {
    eventId: event.id,
    emails: ["one@example.com", "two@example.com"],
  });
  await admin.mutation(api.emails.add, {
    eventId: other.id,
    emails: ["three@example.com"],
  });
  const organizer = await withOrganizer(t, event.id);
  const [one, two] = await admin.query(api.emails.list, { eventId: event.id });
  const [three] = await admin.query(api.emails.list, { eventId: other.id });
  await organizer.mutation(api.emails.remove, { id: one._id });
  await expect(
    organizer.mutation(api.emails.remove, { id: three._id }),
  ).rejects.toThrow("Not an admin for this event");
  await admin.mutation(api.emails.remove, { id: two._id });
  expect(await admin.query(api.emails.list, { eventId: event.id })).toHaveLength(0);
  expect(await admin.query(api.emails.list, { eventId: other.id })).toHaveLength(1);
});

test("event admins can block and unblock a participant from claiming", async () => {
  const { t, admin, event } = await setup();
  await admin.mutation(api.emails.add, {
    eventId: event.id,
    emails: ["guest@example.com"],
  });
  await admin.mutation(api.codes.add, { eventId: event.id, codes: ["A"] });
  const [row] = await admin.query(api.emails.list, { eventId: event.id });
  await t.run(async (ctx) => {
    const [code] = await ctx.db
      .query("codes")
      .withIndex("by_event", (q) => q.eq("eventId", event.id))
      .collect();
    await ctx.db.patch(code._id, { reservedFor: "guest@example.com" });
  });
  const organizer = await withOrganizer(t, event.id);
  const guest = t.withIdentity({
    subject: "guest",
    email: "guest@example.com",
    emailVerified: true,
  });

  await organizer.mutation(api.emails.setBlocked, { id: row._id, blocked: true });
  const [blocked] = await admin.query(api.emails.list, { eventId: event.id });
  expect(blocked).toMatchObject({
    email: "guest@example.com",
    blockedBy: "organizer@example.com",
  });
  expect(blocked.blockedAt).toBeTypeOf("number");
  const codes = await admin.query(api.codes.list, { eventId: event.id });
  expect(codes[0].reservedFor).toBeUndefined();
  expect(await guest.query(api.claims.eligibility, { slug: "meetup" })).toMatchObject({
    eligible: false,
    reason: "not_listed",
  });
  expect(await guest.mutation(api.claims.claim, { slug: "meetup" })).toMatchObject({
    ok: false,
  });
  expect(await guest.query(api.events.mine, {})).toEqual([]);

  await organizer.mutation(api.emails.setBlocked, { id: row._id, blocked: false });
  expect(await guest.mutation(api.claims.claim, { slug: "meetup" })).toMatchObject({
    ok: true,
  });
  const audit = await admin.query(api.auditLog.list, { eventId: event.id });
  expect(audit.map((a) => a.action)).toEqual(
    expect.arrayContaining(["email_blocked", "email_unblocked"]),
  );
});

test("a blocked attendee can't re-enroll on a dynamic event", async () => {
  const { t, admin } = await setup();
  const event = await admin.mutation(api.events.create, {
    name: "Walk up",
    dynamic: true,
  });
  await admin.mutation(api.codes.add, { eventId: event.id, codes: ["A", "B"] });
  await t.run((ctx) =>
    ctx.db.insert("emails", {
      eventId: event.id,
      email: "guest@example.com",
      blockedAt: Date.now(),
    }),
  );
  const guest = t.withIdentity({
    subject: "guest",
    email: "guest@example.com",
    emailVerified: true,
  });
  expect(await guest.query(api.claims.eligibility, { slug: "walk-up" })).toMatchObject({
    eligible: false,
  });
  expect(await guest.mutation(api.claims.claim, { slug: "walk-up" })).toMatchObject({
    ok: false,
  });
});

test("removeUnclaimed deletes only emails without a claimed code and releases their reservations", async () => {
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
  });

  expect(
    await admin.mutation(api.emails.removeUnclaimed, { eventId: event.id }),
  ).toMatchObject({ removed: 2, hasMore: false });

  const remaining = await admin.query(api.emails.list, { eventId: event.id });
  expect(remaining.map((e) => e.email)).toEqual(["one@example.com"]);
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
  expect(requests).toEqual([]);
  const audit = await admin.query(api.auditLog.list, { eventId: event.id });
  expect(audit[0]).toMatchObject({
    action: "emails_removed_unclaimed",
    actorEmail: identity.email,
    details: "Removed 2 unclaimed email(s)",
  });

  expect(
    await admin.mutation(api.emails.removeUnclaimed, { eventId: event.id }),
  ).toMatchObject({ removed: 0, hasMore: false });
  expect(await admin.query(api.emails.list, { eventId: event.id })).toHaveLength(1);
});

test("removeUnclaimed walks large lists with a cursor and skips claimed rows", async () => {
  const { t, admin, event } = await setup();
  const total = UPLOAD_CHUNK_SIZE + 2;
  await t.run(async (ctx) => {
    for (let i = 0; i < total; i++) {
      await ctx.db.insert("emails", {
        eventId: event.id,
        email: `user${i}@example.com`,
      });
    }
    await ctx.db.insert("codes", {
      eventId: event.id,
      code: "A",
      claimedBy: "user0@example.com",
    });
  });
  const first = await admin.mutation(api.emails.removeUnclaimed, {
    eventId: event.id,
  });
  expect(first).toMatchObject({ removed: UPLOAD_CHUNK_SIZE - 1, hasMore: true });
  expect(typeof first.cursor).toBe("string");
  expect(await admin.query(api.emails.list, { eventId: event.id })).toHaveLength(3);
  const second = await admin.mutation(api.emails.removeUnclaimed, {
    eventId: event.id,
    cursor: first.cursor,
  });
  expect(second).toMatchObject({ removed: 2, hasMore: false });
  const remaining = await admin.query(api.emails.list, { eventId: event.id });
  expect(remaining.map((e) => e.email)).toEqual(["user0@example.com"]);
});

test("removeUnclaimed is scoped to the event and open to event admins of that event", async () => {
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
  const organizer = await withOrganizer(t, event.id);
  await expect(
    organizer.mutation(api.emails.removeUnclaimed, { eventId: other.id }),
  ).rejects.toThrow("Not an admin");
  await expect(
    t.mutation(api.emails.removeUnclaimed, { eventId: event.id }),
  ).rejects.toThrow();
  expect(
    await organizer.mutation(api.emails.removeUnclaimed, { eventId: event.id }),
  ).toMatchObject({ removed: 1, hasMore: false });
  expect(await admin.query(api.emails.list, { eventId: event.id })).toEqual([]);
  expect(await admin.query(api.emails.list, { eventId: other.id })).toHaveLength(1);
  const audit = await admin.query(api.auditLog.list, { eventId: event.id });
  expect(audit[0]).toMatchObject({
    action: "emails_removed_unclaimed",
    actorEmail: "organizer@example.com",
  });
});

test("walk-up adds skip duplicate review only when the event allows it", async () => {
  const { t, admin, event } = await setup();
  const other = await admin.mutation(api.events.create, { name: "Other" });
  await admin.mutation(api.emails.add, {
    eventId: other.id,
    emails: ["repeat@example.com"],
  });

  // Default: a walk-up add of an address seen elsewhere is held for review.
  const held = await admin.mutation(api.emails.add, {
    eventId: event.id,
    emails: ["repeat@example.com"],
    walkUp: true,
  });
  expect(held).toMatchObject({ added: 0, flagged: 1 });

  await admin.mutation(api.events.update, {
    id: event.id,
    name: "Meetup",
    slug: "meetup",
    walkUpSkipsReview: true,
  });
  const added = await admin.mutation(api.emails.add, {
    eventId: event.id,
    emails: ["repeat@example.com"],
    walkUp: true,
  });
  expect(added).toMatchObject({ added: 1, flagged: 0 });
  const flags = await t.run((ctx) =>
    ctx.db
      .query("flaggedEmails")
      .withIndex("by_event", (q) => q.eq("eventId", event.id))
      .collect(),
  );
  expect(flags).toEqual([]);
  expect(
    (await admin.query(api.emails.list, { eventId: event.id })).map((e) => e.email),
  ).toEqual(["repeat@example.com"]);

  // Bulk uploads (no walkUp) still flag even with the setting on.
  await admin.mutation(api.emails.add, {
    eventId: other.id,
    emails: ["again@example.com"],
  });
  const bulk = await admin.mutation(api.emails.add, {
    eventId: event.id,
    emails: ["again@example.com"],
  });
  expect(bulk).toMatchObject({ added: 0, flagged: 1 });
});

test("walk-up adds report an attendee still inside the claim cooldown", async () => {
  const { t, admin, event } = await setup();
  const other = await admin.mutation(api.events.create, { name: "Other" });
  const another = await admin.mutation(api.events.create, { name: "Another" });
  const now = Date.now();
  await t.run(async (ctx) => {
    // The limit counts events, so the two claims come from different ones.
    for (const [eventId, code, claimedAt] of [
      [other.id, "A", now - 5 * 24 * 60 * 60 * 1000],
      [another.id, "B", now - 2 * 24 * 60 * 60 * 1000],
    ] as const) {
      await ctx.db.insert("codes", {
        eventId,
        code,
        claimedBy: "busy@example.com",
        claimedAt,
      });
    }
  });

  // Adds without walkUp (uploads) don't look at the cooldown.
  const upload = await admin.mutation(api.emails.add, {
    eventId: event.id,
    emails: ["fresh@example.com"],
  });
  expect(upload.cooldownEligibleAt).toBeUndefined();

  const added = await admin.mutation(api.emails.add, {
    eventId: event.id,
    emails: ["busy@example.com"],
    walkUp: true,
  });
  expect(added.added).toBe(1);
  expect(added.cooldownEligibleAt).toBeGreaterThan(now);

  // Re-adding someone already on the list reports it too.
  const again = await admin.mutation(api.emails.add, {
    eventId: event.id,
    emails: ["busy@example.com"],
    walkUp: true,
  });
  expect(again).toMatchObject({ added: 0, skipped: 1 });
  expect(again.cooldownEligibleAt).toBe(added.cooldownEligibleAt);

  // A waived participant is not reported.
  const row = (await admin.query(api.emails.list, { eventId: event.id })).find(
    (e) => e.email === "busy@example.com",
  )!;
  await admin.mutation(api.emails.setCooldownWaived, { id: row._id, waived: true });
  const waived = await admin.mutation(api.emails.add, {
    eventId: event.id,
    emails: ["busy@example.com"],
    walkUp: true,
  });
  expect(waived.cooldownEligibleAt).toBeUndefined();

  // Nor is someone who already claimed a code from this event.
  await admin.mutation(api.emails.setCooldownWaived, { id: row._id, waived: false });
  await t.run((ctx) =>
    ctx.db.insert("codes", {
      eventId: event.id,
      code: "HERE",
      claimedBy: "busy@example.com",
      claimedAt: now - 60 * 60 * 1000,
    }),
  );
  const claimedHere = await admin.mutation(api.emails.add, {
    eventId: event.id,
    emails: ["busy@example.com"],
    walkUp: true,
  });
  expect(claimedHere).toMatchObject({ added: 0, skipped: 1 });
  expect(claimedHere.cooldownEligibleAt).toBeUndefined();

  // Someone under the limit is not reported either.
  const ok = await admin.mutation(api.emails.add, {
    eventId: event.id,
    emails: ["new@example.com"],
    walkUp: true,
  });
  expect(ok).toMatchObject({ added: 1 });
  expect(ok.cooldownEligibleAt).toBeUndefined();
});

test("turning an event dynamic drops the walk-up review bypass", async () => {
  const { t, admin, event } = await setup();
  await admin.mutation(api.events.update, {
    id: event.id,
    name: "Meetup",
    slug: "meetup",
    walkUpSkipsReview: true,
  });
  expect((await t.run((ctx) => ctx.db.get(event.id)))?.walkUpSkipsReview).toBe(true);
  await admin.mutation(api.events.update, {
    id: event.id,
    name: "Meetup",
    slug: "meetup",
    dynamic: true,
    walkUpSkipsReview: true,
  });
  expect((await t.run((ctx) => ctx.db.get(event.id)))?.walkUpSkipsReview).toBeUndefined();
  await admin.mutation(api.events.update, {
    id: event.id,
    name: "Meetup",
    slug: "meetup",
    dynamic: false,
  });
  expect((await t.run((ctx) => ctx.db.get(event.id)))?.walkUpSkipsReview).toBeUndefined();

  const created = await admin.mutation(api.events.create, {
    name: "Drop-in",
    dynamic: true,
    walkUpSkipsReview: true,
  });
  expect((await t.run((ctx) => ctx.db.get(created.id)))?.walkUpSkipsReview).toBeUndefined();
});
