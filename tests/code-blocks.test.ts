import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import type { Id } from "../convex/_generated/dataModel";
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

async function claimedAndUnclaimed(
  t: ReturnType<typeof convexTest>,
  eventId: Id<"events">
) {
  return await t.run(async (ctx) => {
    const codes = (await ctx.db.query("codes").collect()).filter(
      (c) => c.eventId === eventId
    );
    return {
      claimed: codes.filter((c) => c.claimedBy !== undefined).length,
      unclaimed: codes.filter((c) => c.claimedBy === undefined).length,
    };
  });
}

test("archiving a block stops dispensing and keeps every code; unarchiving restores it", async () => {
  const { t, admin, event } = await setup();
  await admin.mutation(api.codes.add, {
    eventId: event.id,
    codes: ["A", "B"],
    codeType: "Credits",
    value: "50",
  });
  await t.run((ctx) => ctx.db.patch(event.id, { dynamic: true }));
  const attendee = t.withIdentity({
    subject: "a1",
    email: "a1@example.com",
    emailVerified: true,
  });
  expect(
    await attendee.mutation(api.claims.claim, { slug: event.slug, name: "Test Attendee" })
  ).toMatchObject({ code: expect.stringMatching(/^[AB]$/) });

  expect(
    await admin.mutation(api.codes.setTypeArchived, {
      eventId: event.id,
      codeType: "Credits",
      archived: true,
    })
  ).toEqual({ unclaimed: 1, claimed: 1, stripeCodes: 0 });
  const archived = (await admin.query(api.events.get, { id: event.id }))!;
  expect(archived.archivedCodeTypes).toEqual(["Credits"]);
  expect(archived.codeTypes).toEqual(["Credits"]);
  expect(await claimedAndUnclaimed(t, event.id)).toEqual({
    claimed: 1,
    unclaimed: 1,
  });

  const pub = (await t.query(api.events.getBySlug, { slug: event.slug }))!;
  expect(pub.codeTypes).toEqual([]);
  const other = t.withIdentity({
    subject: "a2",
    email: "a2@example.com",
    emailVerified: true,
  });
  expect(
    await other.mutation(api.claims.claim, { slug: event.slug, name: "Test Attendee" })
  ).toMatchObject({ ok: false });
  const mine = await attendee.query(api.codes.mine, {});
  expect(mine?.map((c) => c.event?.slug)).toEqual([event.slug]);
  await expect(
    admin.mutation(api.codes.add, {
      eventId: event.id,
      codes: ["C"],
      codeType: "Credits",
    })
  ).rejects.toThrow(/archived/);

  await admin.mutation(api.codes.setTypeArchived, {
    eventId: event.id,
    codeType: "Credits",
    archived: false,
  });
  expect(
    (await admin.query(api.events.get, { id: event.id }))!.archivedCodeTypes
  ).toEqual([]);
  expect(
    await other.mutation(api.claims.claim, { slug: event.slug, name: "Test Attendee" })
  ).toMatchObject({ code: expect.stringMatching(/^[AB]$/) });
});

test("with one block archived, unrestricted claims come from the other block", async () => {
  const { t, admin, event } = await setup();
  await admin.mutation(api.codes.add, {
    eventId: event.id,
    codes: ["OLD"],
    codeType: "Day one",
  });
  await admin.mutation(api.codes.add, {
    eventId: event.id,
    codes: ["NEW"],
    codeType: "Day two",
  });
  await t.run((ctx) => ctx.db.patch(event.id, { dynamic: true }));
  await admin.mutation(api.codes.setTypeArchived, {
    eventId: event.id,
    codeType: "Day one",
    archived: true,
  });
  const pub = (await t.query(api.events.getBySlug, { slug: event.slug }))!;
  expect(pub.codeTypes).toEqual(["Day two"]);
  const attendee = t.withIdentity({
    subject: "a1",
    email: "a1@example.com",
    emailVerified: true,
  });
  expect(
    await attendee.mutation(api.claims.claim, { slug: event.slug, name: "Test Attendee" })
  ).toMatchObject({ code: "NEW" });
});

test("renaming or deleting an archived block carries the archived state", async () => {
  const { admin, event } = await setup();
  await admin.mutation(api.codes.add, {
    eventId: event.id,
    codes: ["A"],
    codeType: "Credits",
  });
  await admin.mutation(api.codes.setTypeArchived, {
    eventId: event.id,
    codeType: "Credits",
    archived: true,
  });
  await admin.mutation(api.codes.renameType, {
    eventId: event.id,
    from: "Credits",
    to: "Old credits",
  });
  expect(
    (await admin.query(api.events.get, { id: event.id }))!.archivedCodeTypes
  ).toEqual(["Old credits"]);
  await admin.mutation(api.codes.removeType, {
    eventId: event.id,
    codeType: "Old credits",
  });
  expect(
    (await admin.query(api.events.get, { id: event.id }))!.archivedCodeTypes
  ).toEqual([]);
});

test("only system admins can archive a block", async () => {
  const { t, admin, event } = await setup();
  await admin.mutation(api.codes.add, {
    eventId: event.id,
    codes: ["A"],
    codeType: "Credits",
  });
  await t.run((ctx) =>
    ctx.db.insert("eventAdmins", {
      eventId: event.id,
      email: "organizer@example.com",
    })
  );
  const organizer = t.withIdentity({
    subject: "org",
    email: "organizer@example.com",
    emailVerified: true,
  });
  await expect(
    organizer.mutation(api.codes.setTypeArchived, {
      eventId: event.id,
      codeType: "Credits",
      archived: true,
    })
  ).rejects.toThrow(/admin/i);
});

test("archiving a legacy block without a stored type list still lets other codes dispense", async () => {
  const { t, admin, event } = await setup();
  await t.run(async (ctx) => {
    await ctx.db.insert("codes", {
      eventId: event.id,
      code: "LEGACY",
      codeType: "Credits",
    });
    await ctx.db.insert("codes", { eventId: event.id, code: "PLAIN" });
    await ctx.db.patch(event.id, { dynamic: true });
  });
  await admin.mutation(api.codes.setTypeArchived, {
    eventId: event.id,
    codeType: "Credits",
    archived: true,
  });
  const attendee = t.withIdentity({
    subject: "a1",
    email: "a1@example.com",
    emailVerified: true,
  });
  expect(
    await attendee.mutation(api.claims.claim, { slug: event.slug, name: "Test Attendee" })
  ).toMatchObject({ code: "PLAIN" });
});

test("approving an access request never reserves a code from an archived block", async () => {
  const { t, admin, event } = await setup();
  await admin.mutation(api.codes.add, {
    eventId: event.id,
    codes: ["A"],
    codeType: "Credits",
  });
  await admin.mutation(api.codes.setTypeArchived, {
    eventId: event.id,
    codeType: "Credits",
    archived: true,
  });
  const requestId = await t.run((ctx) =>
    ctx.db.insert("accessRequests", {
      eventId: event.id,
      email: "a1@example.com",
      status: "pending",
    })
  );
  await admin.mutation(api.waitlist.approve, { requestId });
  const reserved = await t.run(async (ctx) =>
    (await ctx.db.query("codes").collect()).filter((c) => c.reservedFor)
  );
  expect(reserved).toEqual([]);
});

test("a second block can be created while the only block is archived", async () => {
  const { admin, event } = await setup();
  await admin.mutation(api.codes.add, {
    eventId: event.id,
    codes: ["A"],
    codeType: "Day one",
  });
  await admin.mutation(api.codes.setTypeArchived, {
    eventId: event.id,
    codeType: "Day one",
    archived: true,
  });
  await admin.mutation(api.codes.add, {
    eventId: event.id,
    codes: ["B"],
    codeType: "Day two",
  });
  const updated = (await admin.query(api.events.get, { id: event.id }))!;
  expect(updated.codeTypes).toEqual(["Day one", "Day two"]);
  expect(updated.archivedCodeTypes).toEqual(["Day one"]);
});

test("archiving an event archives every code block with it", async () => {
  const { admin, event } = await setup();
  await admin.mutation(api.codes.add, {
    eventId: event.id,
    codes: ["A", "B"],
    codeType: "Day one",
  });
  await admin.mutation(api.codes.add, {
    eventId: event.id,
    codes: ["C"],
    codeType: "Day two",
  });
  const res = await admin.mutation(api.events.setArchived, {
    id: event.id,
    archived: true,
  });
  expect(res.codeTypesChanged).toBe(2);
  const updated = (await admin.query(api.events.get, { id: event.id }))!;
  expect(updated.archivedAt).toEqual(expect.any(Number));
  expect(updated.archivedCodeTypes).toEqual(["Day one", "Day two"]);
  const managed = await admin.query(api.events.listManaged);
  expect(managed.find((e) => e._id === event.id)?.archived).toBe(true);
});

test("unarchiving an event restores only the blocks it archived", async () => {
  const { admin, event } = await setup();
  await admin.mutation(api.codes.add, {
    eventId: event.id,
    codes: ["A"],
    codeType: "Day one",
  });
  await admin.mutation(api.codes.add, {
    eventId: event.id,
    codes: ["B"],
    codeType: "Day two",
  });
  await admin.mutation(api.codes.setTypeArchived, {
    eventId: event.id,
    codeType: "Day one",
    archived: true,
  });
  await admin.mutation(api.events.setArchived, {
    id: event.id,
    archived: true,
  });
  await admin.mutation(api.events.setArchived, {
    id: event.id,
    archived: false,
  });
  const updated = (await admin.query(api.events.get, { id: event.id }))!;
  expect(updated.archivedAt).toBeUndefined();
  expect(updated.archivedCodeTypes).toEqual(["Day one"]);
});

test("an event with no codes archives and unarchives cleanly", async () => {
  const { admin, event } = await setup();
  const res = await admin.mutation(api.events.setArchived, {
    id: event.id,
    archived: true,
  });
  expect(res.codeTypesChanged).toBe(0);
  await admin.mutation(api.events.setArchived, {
    id: event.id,
    archived: false,
  });
  const updated = (await admin.query(api.events.get, { id: event.id }))!;
  expect(updated.archivedAt).toBeUndefined();
  expect(updated.archivedCodeTypes).toEqual([]);
});

test("event admins cannot archive an event", async () => {
  const { t, event } = await setup();
  const organizer = t.withIdentity({
    subject: "org",
    email: "org@example.com",
    emailVerified: true,
  });
  await expect(
    organizer.mutation(api.events.setArchived, {
      id: event.id,
      archived: true,
    })
  ).rejects.toThrow();
});
