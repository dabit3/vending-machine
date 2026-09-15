import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { blockKey } from "../convex/blockValues";

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

test("the only code block can be deleted, leaving the event with no codes", async () => {
  const { admin, event } = await setup();
  await admin.mutation(api.codes.add, {
    eventId: event.id,
    codes: ["A", "B"],
    codeType: "Credits",
    value: "50",
  });
  expect(
    await admin.mutation(api.codes.removeType, {
      eventId: event.id,
      codeType: "Credits",
    }),
  ).toEqual({ removed: 2, kept: 0 });
  const updated = (await admin.query(api.events.get, { id: event.id }))!;
  expect(updated.codeTypes).toEqual([]);
  expect(updated.codeTypeValues).toEqual({});
  expect(await admin.query(api.codes.list, { eventId: event.id })).toEqual([]);
});

test("deleting the only unnamed block keeps claimed codes and their value", async () => {
  const { t, admin, event } = await setup();
  await admin.mutation(api.codes.add, {
    eventId: event.id,
    codes: ["A", "B"],
    value: "25",
  });
  await t.run(async (ctx) => {
    const code = await ctx.db
      .query("codes")
      .withIndex("by_event", (q) => q.eq("eventId", event.id))
      .first();
    await ctx.db.patch(code!._id, {
      claimedBy: "attendee@example.com",
      claimedAt: Date.now(),
    });
  });
  expect(
    await admin.mutation(api.codes.removeType, { eventId: event.id }),
  ).toEqual({ removed: 1, kept: 1 });
  const updated = (await admin.query(api.events.get, { id: event.id }))!;
  expect(updated.codeTypes).toEqual([]);
  expect(updated.codeTypeValues?.[blockKey("")]).toBe("25");
  const remaining = await admin.query(api.codes.list, { eventId: event.id });
  expect(remaining.map((c) => c.claimedBy)).toEqual(["attendee@example.com"]);
});

test("deleting a block the event does not have is rejected", async () => {
  const { admin, event } = await setup();
  await expect(
    admin.mutation(api.codes.removeType, {
      eventId: event.id,
      codeType: "Missing",
    }),
  ).rejects.toThrow("no such code block");
});

test("legacy events without a stored type list can still delete their block", async () => {
  const { t, admin, event } = await setup();
  await t.run(async (ctx) => {
    await ctx.db.insert("codes", { eventId: event.id, code: "LEGACY", codeType: "Old" });
  });
  expect(
    await admin.mutation(api.codes.removeType, { eventId: event.id, codeType: "Old" }),
  ).toEqual({ removed: 1, kept: 0 });
  expect(await admin.query(api.codes.list, { eventId: event.id })).toEqual([]);
});
