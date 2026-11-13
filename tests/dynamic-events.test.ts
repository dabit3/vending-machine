import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
const walkUp = {
  subject: "walk-up",
  email: "Walk.Up@Example.com",
  emailVerified: true,
};
const walkUpEmail = "walk.up@example.com";

async function setup({ dynamic, codes }: { dynamic: boolean; codes: string[] }) {
  const t = convexTest(schema, modules);
  const eventId = await t.run(async (ctx) => {
    const eventId = await ctx.db.insert("events", {
      name: "Meetup",
      slug: "meetup",
      dynamic: dynamic || undefined,
    });
    for (const code of codes) {
      await ctx.db.insert("codes", { eventId, code });
    }
    return eventId;
  });
  return { t, eventId, user: t.withIdentity(walkUp) };
}

test("non-dynamic events still require the participant list", async () => {
  const { user } = await setup({ dynamic: false, codes: ["A"] });
  expect(await user.query(api.claims.eligibility, { slug: "meetup" })).toMatchObject({
    eligible: false,
    reason: "not_listed",
  });
  expect(await user.mutation(api.claims.claim, { slug: "meetup", name: "Test Attendee" })).toMatchObject({
    ok: false,
  });
});

test("dynamic events let any verified email claim once and record the email", async () => {
  const { t, eventId, user } = await setup({ dynamic: true, codes: ["A", "B"] });
  expect(await user.query(api.events.getBySlug, { slug: "meetup" })).toMatchObject({
    dynamic: true,
  });
  expect(await user.query(api.claims.eligibility, { slug: "meetup" })).toMatchObject({
    eligible: true,
    identity: walkUpEmail,
    instructionsViewed: false,
  });

  const first = await user.mutation(api.claims.claim, { slug: "meetup", name: "Test Attendee" });
  expect(first).toMatchObject({ ok: true, code: "A" });

  const second = await user.mutation(api.claims.claim, { slug: "meetup", name: "Test Attendee" });
  expect(second).toMatchObject({ ok: true, code: "A", alreadyClaimed: true });

  await t.run(async (ctx) => {
    const participants = await ctx.db
      .query("emails")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    expect(participants.map((p) => p.email)).toEqual([walkUpEmail]);
    const claimed = await ctx.db
      .query("codes")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    expect(claimed.filter((c) => c.claimedBy === walkUpEmail)).toHaveLength(1);
  });
});

test("dynamic events report sold out once the pool is exhausted", async () => {
  const { t, eventId, user } = await setup({ dynamic: true, codes: ["A"] });
  await t.run(async (ctx) => {
    await ctx.db.insert("emails", { eventId, email: "other@example.com" });
    const [code] = await ctx.db
      .query("codes")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    await ctx.db.patch(code._id, {
      claimedBy: "other@example.com",
      claimedAt: Date.now(),
    });
  });
  expect(await user.mutation(api.claims.claim, { slug: "meetup", name: "Test Attendee" })).toMatchObject({
    ok: false,
    error: "All codes for this event have been claimed.",
  });
});

test("dynamic events gate on instructions and enroll on acknowledgement", async () => {
  const { t, eventId, user } = await setup({ dynamic: true, codes: ["A"] });
  await t.run(async (ctx) => {
    await ctx.db.patch(eventId, { claimInstructions: "Redeem at checkout." });
  });
  expect(await user.mutation(api.claims.claim, { slug: "meetup", name: "Test Attendee" })).toMatchObject({
    ok: false,
    error: "Read the redemption instructions before claiming your code.",
  });
  await user.mutation(api.claims.markInstructionsRead, { slug: "meetup" });
  expect(await user.query(api.claims.eligibility, { slug: "meetup" })).toMatchObject({
    eligible: true,
    instructionsViewed: true,
  });
  expect(await user.mutation(api.claims.claim, { slug: "meetup", name: "Test Attendee" })).toMatchObject({
    ok: true,
    code: "A",
  });
});

test("blacklisted emails cannot claim from dynamic events", async () => {
  const { t, user } = await setup({ dynamic: true, codes: ["A"] });
  await t.run(async (ctx) => {
    await ctx.db.insert("blacklistedEmails", { email: walkUpEmail });
  });
  expect(await user.query(api.claims.eligibility, { slug: "meetup" })).toMatchObject({
    eligible: false,
    reason: "not_listed",
  });
  expect(await user.mutation(api.claims.claim, { slug: "meetup", name: "Test Attendee" })).toMatchObject({
    ok: false,
  });
});

test("events record the normalized email of the admin who created them", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("admins", { email: walkUpEmail });
  });
  const admin = t.withIdentity(walkUp);

  const { id } = await admin.mutation(api.events.create, { name: "Made by me" });
  expect(await admin.query(api.events.get, { id })).toMatchObject({
    createdBy: walkUpEmail,
  });
  expect(await admin.query(api.events.listManaged, {})).toMatchObject([
    { createdBy: walkUpEmail },
  ]);

  // Events created before the field existed report no creator.
  await t.run(async (ctx) => {
    await ctx.db.patch(id, { createdBy: undefined });
  });
  expect((await admin.query(api.events.get, { id }))?.createdBy).toBeUndefined();
});

test("the home page lists only the events the viewer is enrolled in or has claimed", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("admins", { email: walkUpEmail });
  });
  const admin = t.withIdentity(walkUp);
  const user = t.withIdentity({ subject: "att", email: "Att@Example.com", emailVerified: true });

  // Signed-out and unverified viewers get nothing to list.
  expect(await t.query(api.events.mine, {})).toBeNull();
  expect(
    await t
      .withIdentity({ subject: "unverified", email: "att@example.com", emailVerified: false })
      .query(api.events.mine, {}),
  ).toBeNull();

  // Older admin forms still send `hidden`; it is accepted and ignored, and
  // the public listing they subscribe to is now always empty.
  const { id: listed } = await admin.mutation(api.events.create, {
    name: "Listed",
    eventDate: "2026-10-01",
    hidden: false,
  });
  await admin.mutation(api.events.update, {
    id: listed,
    name: "Listed",
    slug: "listed",
    eventDate: "2026-10-01",
    hidden: true,
  });
  expect(await t.query(api.events.list, {})).toEqual([]);
  const { id: undated } = await admin.mutation(api.events.create, { name: "Undated" });
  const { id: claimedOnly } = await admin.mutation(api.events.create, {
    name: "Claimed only",
    eventDate: "2026-09-01",
  });
  await admin.mutation(api.events.create, { name: "Not mine" });
  await admin.mutation(api.events.create, { name: "Dynamic", dynamic: true });
  expect(await admin.query(api.events.get, { id: listed })).not.toHaveProperty("hidden");
  await t.run(async (ctx) => {
    expect((await ctx.db.get(listed))?.hidden).toBeUndefined();
  });

  await t.run(async (ctx) => {
    await ctx.db.insert("emails", { eventId: listed, email: "att@example.com" });
    await ctx.db.insert("emails", { eventId: undated, email: "att@example.com" });
    // Claimed codes count even after the address left the participant list.
    await ctx.db.insert("codes", {
      eventId: claimedOnly,
      code: "X",
      claimedBy: "att@example.com",
      claimedAt: 1,
    });
  });

  expect(await user.query(api.events.mine, {})).toMatchObject([
    { name: "Claimed only", claimed: true },
    { name: "Listed", claimed: false },
    { name: "Undated", claimed: false },
  ]);
  expect(await admin.query(api.events.mine, {})).toEqual([]);

  await t.run(async (ctx) => {
    await ctx.db.insert("blacklistedEmails", { email: "att@example.com" });
  });
  expect(await user.query(api.events.mine, {})).toEqual([]);
});

test("dynamic events require the claimant's name and keep it on the participant row", async () => {
  const { t, user, eventId } = await setup({ dynamic: true, codes: ["A"] });
  expect(await user.mutation(api.claims.claim, { slug: "meetup" })).toMatchObject({
    ok: false,
    error: "Enter your name to claim your code.",
  });
  expect(await user.mutation(api.claims.claim, { slug: "meetup", name: " \u0085\u200b " })).toMatchObject({
    ok: false,
    error: "Enter your name to claim your code.",
  });
  expect(
    await user.mutation(api.claims.claim, { slug: "meetup", name: "  Ada Lovelace  " }),
  ).toMatchObject({ ok: true, code: "A" });
  const row = await t.run(async (ctx) =>
    (
      await ctx.db
        .query("emails")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .collect()
    ).find((e) => e.name !== undefined),
  );
  expect(row?.name).toBe("Ada Lovelace");
  // Returning for the same code doesn't need the name again.
  expect(await user.mutation(api.claims.claim, { slug: "meetup" })).toMatchObject({
    ok: true,
    code: "A",
    alreadyClaimed: true,
  });
});

test("claimant names are flattened to one printable line and ignored on list events", async () => {
  const dynamic = await setup({ dynamic: true, codes: ["A"] });
  expect(
    await dynamic.user.mutation(api.claims.claim, {
      slug: "meetup",
      name: " Ada\nLovelace\u0000\t \u202e\u061c\u200d Jr.\u0085\u00ad",
    }),
  ).toMatchObject({ ok: true });
  const dynamicRow = await dynamic.t.run(async (ctx) =>
    (await ctx.db.query("emails").collect()).find((e) => e.name !== undefined),
  );
  expect(dynamicRow?.name).toBe("Ada Lovelace Jr.");

  const listed = await setup({ dynamic: false, codes: ["A"] });
  const email = await listed.t.run(async (ctx) =>
    ctx.db.insert("emails", { eventId: listed.eventId, email: "walk.up@example.com" }),
  );
  expect(
    await listed.user.mutation(api.claims.claim, { slug: "meetup", name: "Sneaky Name" }),
  ).toMatchObject({ ok: true, code: "A" });
  expect((await listed.t.run((ctx) => ctx.db.get(email)))?.name).toBeUndefined();
});

test("a claim that opens the instructions dispenses and records the read", async () => {
  const { t, eventId, user } = await setup({ dynamic: true, codes: ["A"] });
  await t.run(async (ctx) => {
    await ctx.db.patch(eventId, { claimInstructions: "Redeem at checkout." });
  });
  // A refused claim leaves the instructions unread.
  expect(
    await user.mutation(api.claims.claim, {
      slug: "meetup",
      instructionsRead: true,
    })
  ).toMatchObject({ ok: false, error: "Enter your name to claim your code." });
  expect(await user.query(api.claims.eligibility, { slug: "meetup" })).toMatchObject({
    eligible: true,
    instructionsViewed: false,
  });
  // So does one refused because the codes ran out.
  const codeId = await t.run(async (ctx) => {
    const code = (await ctx.db.query("codes").collect())[0];
    await ctx.db.patch(code._id, {
      claimedBy: "other@example.com",
      claimedAt: Date.now(),
    });
    return code._id;
  });
  expect(
    await user.mutation(api.claims.claim, {
      slug: "meetup",
      name: "Test Attendee",
      instructionsRead: true,
    })
  ).toMatchObject({
    ok: false,
    error: "All codes for this event have been claimed.",
  });
  expect(await user.query(api.claims.eligibility, { slug: "meetup" })).toMatchObject({
    instructionsViewed: false,
  });
  await t.run((ctx) =>
    ctx.db.patch(codeId, { claimedBy: undefined, claimedAt: undefined })
  );
  expect(
    await user.mutation(api.claims.claim, {
      slug: "meetup",
      name: "Test Attendee",
      instructionsRead: true,
    })
  ).toMatchObject({ ok: true, code: "A", alreadyClaimed: false });
  expect(await user.query(api.claims.eligibility, { slug: "meetup" })).toMatchObject({
    eligible: true,
    instructionsViewed: true,
    claimed: { code: "A" },
  });
});
