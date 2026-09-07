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
