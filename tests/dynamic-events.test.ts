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
  expect(await user.mutation(api.claims.claim, { slug: "meetup" })).toMatchObject({
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
    email: walkUpEmail,
    instructionsViewed: false,
  });

  const first = await user.mutation(api.claims.claim, { slug: "meetup" });
  expect(first).toMatchObject({ ok: true, code: "A" });

  const second = await user.mutation(api.claims.claim, { slug: "meetup" });
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
  expect(await user.mutation(api.claims.claim, { slug: "meetup" })).toMatchObject({
    ok: false,
    error: "All codes for this event have been claimed.",
  });
});

test("dynamic events gate on instructions and enroll on acknowledgement", async () => {
  const { t, eventId, user } = await setup({ dynamic: true, codes: ["A"] });
  await t.run(async (ctx) => {
    await ctx.db.patch(eventId, { claimInstructions: "Redeem at checkout." });
  });
  expect(await user.mutation(api.claims.claim, { slug: "meetup" })).toMatchObject({
    ok: false,
    error: "Read the redemption instructions before claiming your code.",
  });
  await user.mutation(api.claims.markInstructionsRead, { slug: "meetup" });
  expect(await user.query(api.claims.eligibility, { slug: "meetup" })).toMatchObject({
    eligible: true,
    instructionsViewed: true,
  });
  expect(await user.mutation(api.claims.claim, { slug: "meetup" })).toMatchObject({
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
  expect(await user.mutation(api.claims.claim, { slug: "meetup" })).toMatchObject({
    ok: false,
  });
});
