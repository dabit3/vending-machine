import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { activeCodeTypes, blockKey } from "../convex/blockValues";

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

test("a deleted block's kept claimed codes do not count toward the two-block limit", async () => {
  const { t, admin, event } = await setup();
  await admin.mutation(api.codes.add, {
    eventId: event.id,
    codes: ["A"],
    codeType: "Credits",
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
  await admin.mutation(api.codes.removeType, {
    eventId: event.id,
    codeType: "Credits",
  });
  await admin.mutation(api.codes.add, {
    eventId: event.id,
    codes: ["B"],
    codeType: "Gold",
  });
  await admin.mutation(api.codes.add, {
    eventId: event.id,
    codes: ["C"],
    codeType: "Silver",
  });
  const updated = (await admin.query(api.events.get, { id: event.id }))!;
  expect(updated.codeTypes).toEqual(["Gold", "Silver"]);
  expect(activeCodeTypes(updated, await admin.query(api.codes.list, { eventId: event.id })))
    .toEqual(["Gold", "Silver"]);
});

test("legacy events derive their active blocks from codes", () => {
  const codes = [
    { codeType: "B", _creationTime: 2 },
    { codeType: undefined, _creationTime: 1 },
    { codeType: "B", _creationTime: 3 },
  ];
  expect(activeCodeTypes({}, codes)).toEqual(["", "B"]);
  expect(activeCodeTypes({ codeTypes: [] }, codes)).toEqual([]);
});

test("event admins can rename, revalue and delete codes but not add them", async () => {
  const { t, admin, event } = await setup();
  await admin.mutation(api.codes.add, {
    eventId: event.id,
    codes: ["A", "B"],
    codeType: "Credits",
    value: "50",
  });
  const eventAdminEmail = "organizer@example.com";
  await t.run((ctx) =>
    ctx.db.insert("eventAdmins", { eventId: event.id, email: eventAdminEmail }),
  );
  const organizer = t.withIdentity({
    subject: "organizer",
    email: eventAdminEmail,
    emailVerified: true,
  });
  await expect(
    organizer.mutation(api.codes.add, {
      eventId: event.id,
      codes: ["C"],
      codeType: "Credits",
    }),
  ).rejects.toThrow("Not an admin");
  await organizer.mutation(api.codes.renameType, {
    eventId: event.id,
    from: "Credits",
    to: "Gold",
  });
  await organizer.mutation(api.codes.setTypeValue, {
    eventId: event.id,
    codeType: "Gold",
    value: "75",
  });
  const [first] = await organizer.query(api.codes.list, { eventId: event.id });
  await organizer.mutation(api.codes.remove, { id: first._id });
  expect(
    await organizer.mutation(api.codes.removeType, {
      eventId: event.id,
      codeType: "Gold",
    }),
  ).toEqual({ removed: 1, kept: 0 });
  expect(await organizer.query(api.codes.list, { eventId: event.id })).toEqual([]);
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
