import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
const adminIdentity = {
  subject: "admin",
  email: "admin@example.com",
  emailVerified: true,
};
const eventAdminIdentity = {
  subject: "event-admin",
  email: "helper@example.com",
  emailVerified: true,
};

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    await ctx.db.insert("admins", { email: "admin@example.com" });
    const listed = await ctx.db.insert("events", { name: "Listed", slug: "listed" });
    const claimed = await ctx.db.insert("events", { name: "Claimed", slug: "claimed" });
    const other = await ctx.db.insert("events", { name: "Other", slug: "other" });
    const xEvent = await ctx.db.insert("events", {
      name: "X event",
      slug: "x-event",
      identity: "x",
    });
    await ctx.db.insert("emails", { eventId: listed, email: "ada@example.com" });
    await ctx.db.insert("emails", { eventId: claimed, email: "ada@example.com" });
    await ctx.db.insert("codes", {
      eventId: claimed,
      code: "CODE-1",
      claimedBy: "ada@example.com",
      claimedAt: 1,
    });
    await ctx.db.insert("emails", { eventId: other, email: "someone@example.com" });
    await ctx.db.insert("accessRequests", {
      eventId: other,
      email: "ada@example.com",
      status: "pending",
    });
    await ctx.db.insert("emails", { eventId: xEvent, email: "@ada" });
    await ctx.db.insert("eventAdmins", { eventId: listed, email: "helper@example.com" });
    return { listed, claimed, other, xEvent };
  });
  return { t, ids };
}

test("system admins find every event an email appears on, case-insensitively", async () => {
  const { t } = await setup();
  const admin = t.withIdentity(adminIdentity);
  const found = await admin.query(api.events.searchByAttendee, {
    query: "  Ada@Example.com ",
  });
  expect(found?.key).toBe("ada@example.com");
  const byName = Object.fromEntries(
    (found?.results ?? []).map((r) => [r.name, r])
  );
  expect(Object.keys(byName).sort()).toEqual(["Claimed", "Listed", "Other"]);
  expect(byName.Listed).toMatchObject({ participant: true, flagged: false });
  expect(byName.Listed.claimedCode).toBeUndefined();
  expect(byName.Claimed).toMatchObject({ participant: true, claimedCode: "CODE-1" });
  expect(byName.Other).toMatchObject({ participant: false, accessRequest: "pending" });
});

test("X handles are searchable in any accepted form", async () => {
  const { t } = await setup();
  const admin = t.withIdentity(adminIdentity);
  for (const query of ["@ADA", "ada", "https://x.com/ada", "https://twitter.com/@Ada"]) {
    const found = await admin.query(api.events.searchByAttendee, { query });
    expect(found?.key).toBe("@ada");
    expect(found?.results.map((r) => r.name)).toEqual(["X event"]);
  }
});

test("event admins only see matches in events they manage", async () => {
  const { t } = await setup();
  const helper = t.withIdentity(eventAdminIdentity);
  const found = await helper.query(api.events.searchByAttendee, {
    query: "ada@example.com",
  });
  expect(found?.results.map((r) => r.name)).toEqual(["Listed"]);
});

test("invalid queries and anonymous callers get no results", async () => {
  const { t } = await setup();
  expect(
    await t.withIdentity(adminIdentity).query(api.events.searchByAttendee, {
      query: "not an email",
    })
  ).toBeNull();
  expect(
    await t.query(api.events.searchByAttendee, { query: "ada@example.com" })
  ).toBeNull();
  const stranger = t.withIdentity({
    subject: "s",
    email: "stranger@example.com",
    emailVerified: true,
  });
  expect(
    await stranger.query(api.events.searchByAttendee, { query: "ada@example.com" })
  ).toEqual({ key: "ada@example.com", results: [] });
});
