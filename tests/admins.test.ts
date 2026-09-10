import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
const identity = {
  subject: "admin-user",
  email: "admin@example.com",
  emailVerified: true,
};

test("an empty allowlist never grants admin access or allows self-enrollment", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity(identity);
  expect(await user.query(api.admins.accessLevel)).toEqual({
    isGlobalAdmin: false,
    hasEventAccess: false,
  });
  await expect(
    user.mutation(api.admins.add, { email: identity.email }),
  ).rejects.toThrow();
  await expect(
    user.mutation(api.events.create, { name: "Unauthorized" }),
  ).rejects.toThrow();
});

test("global access requires a verified, allowlisted email", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("admins", { email: identity.email });
  });
  expect(await t.withIdentity(identity).query(api.admins.isAdmin)).toBe(true);
  expect(
    await t
      .withIdentity({ ...identity, email: " ADMIN@example.com " })
      .query(api.admins.isAdmin),
  ).toBe(true);
  for (const emailVerified of [false, undefined]) {
    const user = t.withIdentity({ ...identity, emailVerified });
    expect(await user.query(api.admins.isAdmin)).toBe(false);
    await expect(
      user.mutation(api.events.create, { name: "Unauthorized" }),
    ).rejects.toThrow();
  }
  expect(await t.query(api.admins.isAdmin)).toBe(false);
});

test("event membership does not grant global access", async () => {
  const t = convexTest(schema, modules);
  const eventId = await t.run(async (ctx) => {
    const eventId = await ctx.db.insert("events", {
      name: "Event",
      slug: "event",
    });
    await ctx.db.insert("eventAdmins", { eventId, email: identity.email });
    return eventId;
  });
  const user = t.withIdentity(identity);
  expect(await user.query(api.admins.accessLevel)).toEqual({
    isGlobalAdmin: false,
    hasEventAccess: true,
  });
  await expect(
    user.query(api.events.get, { id: eventId }),
  ).resolves.toMatchObject({ name: "Event" });
  await expect(
    user.mutation(api.events.create, { name: "Unauthorized" }),
  ).rejects.toThrow();
  await expect(
    user.mutation(api.admins.add, { email: identity.email }),
  ).rejects.toThrow();
});

test("event history is global-admin only and aggregates claims per event and day", async () => {
  const t = convexTest(schema, modules);
  const eventId = await t.run(async (ctx) => {
    const eventId = await ctx.db.insert("events", {
      name: "Event",
      slug: "event",
      eventDate: "2026-08-01",
    });
    const now = new Date();
    const yesterday = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - 1,
    );
    // ONE and TWO have matching claimEvents rows (post-ledger claims);
    // LEGACY is claimed on a code with no ledger row (pre-ledger claim).
    await ctx.db.insert("codes", {
      eventId,
      code: "ONE",
      claimedBy: "a@example.com",
      claimedAt: yesterday,
    });
    await ctx.db.insert("codes", {
      eventId,
      code: "TWO",
      claimedBy: "b@example.com",
      claimedAt: yesterday,
    });
    await ctx.db.insert("claimEvents", {
      eventId,
      email: "a@example.com",
      claimedAt: yesterday,
    });
    await ctx.db.insert("claimEvents", {
      eventId,
      email: "b@example.com",
      claimedAt: yesterday,
    });
    await ctx.db.insert("codes", {
      eventId,
      code: "LEGACY",
      claimedBy: "legacy@example.com",
      claimedAt: yesterday,
    });
    await ctx.db.insert("codes", { eventId, code: "THREE" });
    await ctx.db.insert("emails", { eventId, email: "a@example.com" });
    await ctx.db.insert("accessRequests", {
      eventId,
      email: "c@example.com",
      status: "approved",
    });
    return eventId;
  });

  const args = { days: 365 };
  const member = t.withIdentity(identity);
  await expect(member.query(api.events.history, args)).rejects.toThrow();

  await t.run(async (ctx) => {
    await ctx.db.insert("admins", { email: identity.email });
  });
  const result = await member.query(api.events.history, args);
  expect(result.daily).toEqual([
    {
      date: new Date(
        Date.UTC(
          new Date().getUTCFullYear(),
          new Date().getUTCMonth(),
          new Date().getUTCDate() - 1,
        ),
      )
        .toISOString()
        .slice(0, 10),
      count: 3,
    },
  ]);
  expect(result.events).toHaveLength(1);
  expect(result.events[0]).toMatchObject({
    eventId,
    name: "Event",
    codes: 4,
    claimed: 3,
    attendees: 3,
    activeInRange: true,
    eligible: 1,
    requests: 1,
    approved: 1,
    denied: 0,
    claimRate: 3 / 4,
  });
  expect(result.totals.claimants).toBe(3);

  // Re-claiming a pre-ledger code preserves its dispense in claimEvents,
  // so deleting the code row doesn't erase it from the calendar.
  await member.mutation(api.claims.allowReclaim, {
    eventId,
    email: "legacy@example.com",
  });
  const after = await member.query(api.events.history, args);
  expect(after.daily.reduce((sum, day) => sum + day.count, 0)).toBe(3);
  expect(after.totals.claimants).toBe(3);
});
