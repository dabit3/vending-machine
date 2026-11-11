import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { claimsByEvent } from "../lib/claim-cooldown";

const modules = import.meta.glob("../convex/**/*.ts");
const adminIdentity = { subject: "admin", email: "admin@example.com", emailVerified: true };
const attendee = { subject: "att", email: "att@example.com", emailVerified: true };
const other = { subject: "oth", email: "oth@example.com", emailVerified: true };

async function setup(claimMode?: "one" | "all") {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("admins", { email: adminIdentity.email }));
  const admin = t.withIdentity(adminIdentity);
  const event = await admin.mutation(api.events.create, {
    name: "Launch",
    slug: "launch",
    claimMode,
    codeBlocks: [
      { name: "Max plan", value: "200", codes: ["MAX-1", "MAX-2"] },
      { name: "On-demand usage", value: "5000", codes: ["USE-1"] },
    ],
  });
  await admin.mutation(api.emails.add, {
    eventId: event.id,
    emails: [attendee.email, other.email],
  });
  return { t, admin, event, user: t.withIdentity(attendee), second: t.withIdentity(other) };
}

test("event creation stores both pasted blocks, in order, with values and the claim mode", async () => {
  const { t, event, admin } = await setup("all");
  const doc = await t.run((ctx) => ctx.db.get(event.id));
  expect(doc).toMatchObject({
    claimMode: "all",
    codeTypes: ["Max plan", "On-demand usage"],
    codeTypeValues: { "Max plan": "200", "On-demand usage": "5000" },
  });
  expect(await admin.query(api.codes.list, { eventId: event.id })).toHaveLength(3);
  const page = await t.query(api.events.getBySlug, { slug: "launch" });
  expect(page).toMatchObject({
    claimMode: "all",
    codeTypes: ["Max plan", "On-demand usage"],
    soldOut: false,
  });
});

test("one claim dispenses a code from every block", async () => {
  const { user } = await setup("all");
  const res = await user.mutation(api.claims.claim, { slug: "launch" });
  expect(res).toMatchObject({ ok: true, alreadyClaimed: false, code: "MAX-1" });
  if (!res.ok) throw new Error("claim failed");
  expect(res.codes).toEqual([
    expect.objectContaining({ code: "MAX-1", codeType: "Max plan", creditAmount: "200" }),
    expect.objectContaining({ code: "USE-1", codeType: "On-demand usage", creditAmount: "5000" }),
  ]);

  // Claiming again hands back the same pair.
  const again = await user.mutation(api.claims.claim, { slug: "launch" });
  expect(again).toMatchObject({ ok: true, alreadyClaimed: true });
  if (again.ok) expect(again.codes.map((c) => c.code)).toEqual(["MAX-1", "USE-1"]);

  const eligibility = await user.query(api.claims.eligibility, { slug: "launch" });
  expect(eligibility).toMatchObject({
    eligible: true,
    claimed: { code: "MAX-1" },
    pendingTypes: [],
  });
  if (eligibility.eligible && "claimedCodes" in eligibility) {
    expect(eligibility.claimedCodes?.map((c) => c.code)).toEqual(["MAX-1", "USE-1"]);
  }
});

test("a block that ran out is skipped and can be collected once restocked", async () => {
  const { admin, event, user, second } = await setup("all");
  await user.mutation(api.claims.claim, { slug: "launch" });

  // On-demand usage is now empty: the next attendee still gets Max plan.
  const partial = await second.mutation(api.claims.claim, { slug: "launch" });
  expect(partial).toMatchObject({ ok: true, alreadyClaimed: false });
  if (partial.ok) expect(partial.codes.map((c) => c.code)).toEqual(["MAX-2"]);
  expect(
    await second.query(api.claims.eligibility, { slug: "launch" }),
  ).toMatchObject({ eligible: true, pendingTypes: [] });

  await admin.mutation(api.codes.add, {
    eventId: event.id,
    codes: ["USE-2"],
    codeType: "On-demand usage",
  });
  expect(
    await second.query(api.claims.eligibility, { slug: "launch" }),
  ).toMatchObject({ eligible: true, pendingTypes: ["On-demand usage"] });
  const rest = await second.mutation(api.claims.claim, { slug: "launch" });
  expect(rest).toMatchObject({ ok: true, alreadyClaimed: false });
  if (rest.ok) expect(rest.codes.map((c) => c.code)).toEqual(["MAX-2", "USE-2"]);
});

test("nothing left in any block is an error", async () => {
  const { t, event, user } = await setup("all");
  await t.run(async (ctx) => {
    for (const code of await ctx.db
      .query("codes")
      .withIndex("by_event", (q) => q.eq("eventId", event.id))
      .collect()) {
      await ctx.db.patch(code._id, { claimedBy: "someone@example.com" });
    }
  });
  expect(await user.mutation(api.claims.claim, { slug: "launch" })).toEqual({
    ok: false,
    error: "All codes for this event have been claimed.",
  });
});

test("an archived block is left out of the pair", async () => {
  const { admin, event, user } = await setup("all");
  await admin.mutation(api.codes.setTypeArchived, {
    eventId: event.id,
    codeType: "On-demand usage",
    archived: true,
  });
  const res = await user.mutation(api.claims.claim, { slug: "launch" });
  expect(res.ok && res.codes.map((c) => c.code)).toEqual(["MAX-1"]);
});

test("the default mode still dispenses one code of the attendee's choice", async () => {
  const { user, t, event } = await setup();
  expect((await t.run((ctx) => ctx.db.get(event.id)))?.claimMode).toBeUndefined();
  const res = await user.mutation(api.claims.claim, {
    slug: "launch",
    codeType: "On-demand usage",
  });
  expect(res).toMatchObject({ ok: true, code: "USE-1", alreadyClaimed: false });
  if (res.ok) expect(res.codes).toHaveLength(1);
  const again = await user.mutation(api.claims.claim, { slug: "launch", codeType: "Max plan" });
  expect(again).toMatchObject({ ok: true, code: "USE-1", alreadyClaimed: true });
});

test("setClaimMode switches an event and lets earlier attendees collect the other code", async () => {
  const { admin, event, user, second } = await setup();
  await user.mutation(api.claims.claim, { slug: "launch", codeType: "Max plan" });
  await expect(
    second.mutation(api.events.setClaimMode, { id: event.id, claimMode: "all" }),
  ).rejects.toThrow(/Not an admin/);
  await admin.mutation(api.events.setClaimMode, { id: event.id, claimMode: "all" });
  expect(
    await user.query(api.claims.eligibility, { slug: "launch" }),
  ).toMatchObject({ pendingTypes: ["On-demand usage"] });
  const res = await user.mutation(api.claims.claim, { slug: "launch" });
  expect(res.ok && res.codes.map((c) => c.code)).toEqual(["MAX-1", "USE-1"]);

  // Back to one each: both codes stay on the receipt.
  await admin.mutation(api.events.setClaimMode, { id: event.id, claimMode: "one" });
  const after = await user.mutation(api.claims.claim, { slug: "launch" });
  expect(after).toMatchObject({ ok: true, alreadyClaimed: true });
  if (after.ok) expect(after.codes).toHaveLength(2);
  expect(
    await user.query(api.claims.eligibility, { slug: "launch" }),
  ).toMatchObject({ eligible: true, pendingTypes: [] });
});

test("a pair counts as one claim toward the 60-day limit", async () => {
  const { t, admin, user } = await setup("all");
  await user.mutation(api.claims.claim, { slug: "launch" });
  for (const slug of ["second", "third"]) {
    const ev = await admin.mutation(api.events.create, {
      name: slug,
      slug,
      codeBlocks: [{ codes: [`${slug}-1`] }],
    });
    // Inserted directly: emails.add would hold a repeat attendee for review.
    await t.run((ctx) =>
      ctx.db.insert("emails", { eventId: ev.id, email: attendee.email }),
    );
  }
  // Two codes from one event leave room for one more event.
  expect(await user.mutation(api.claims.claim, { slug: "second" })).toMatchObject({
    ok: true,
    code: "second-1",
  });
  const third = await user.mutation(api.claims.claim, { slug: "third" });
  expect(third.ok).toBe(false);
  if (!third.ok) expect(third.error).toMatch(/codes at 2 events/);
});

test("claimsByEvent keeps the earliest dated claim per event", () => {
  expect(
    claimsByEvent([
      { eventId: "a", claimedAt: 50 },
      { eventId: "a", claimedAt: 20 },
      { eventId: "b" },
      { eventId: "b", claimedAt: 70 },
      { eventId: "c" },
    ]),
  ).toEqual([{ claimedAt: 20 }, { claimedAt: 70 }, { claimedAt: undefined }]);
});

test("code block validation at creation", async () => {
  const { admin } = await setup();
  const create = (codeBlocks: { name?: string; value?: string; codes?: string[] }[]) =>
    admin.mutation(api.events.create, { name: "X", codeBlocks });
  await expect(
    create([{ name: "A", codes: ["1"] }, { name: "B", codes: ["2"] }, { name: "C", codes: ["3"] }]),
  ).rejects.toThrow(/at most two code blocks/);
  await expect(create([{ name: "A", codes: ["1"] }, { codes: ["2"] }])).rejects.toThrow(
    /Name both code blocks/,
  );
  await expect(
    create([{ name: "A", codes: ["1"] }, { name: "A", codes: ["2"] }]),
  ).rejects.toThrow(/different names/);
  await expect(create([{ name: "A", codes: ["  "] }])).rejects.toThrow(/at least one code/);
  // A shared code would be dropped from the second block on insert.
  await expect(
    create([{ name: "A", codes: ["1", "2"] }, { name: "B", codes: [" 2 ", "3"] }]),
  ).rejects.toThrow(/"2" is in both blocks/);
  await expect(create([{ name: "A" }])).rejects.toThrow(/one source/);
  // A failed creation leaves no event behind.
  expect(await admin.query(api.events.listManaged, {})).toHaveLength(1);
});
