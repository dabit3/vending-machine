import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import {
  CLAIM_WINDOW_MS,
  claimCooldown,
  cooldownNotice,
} from "../lib/claim-cooldown";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 8, 12);

test("claimCooldown counts recent claims and derives the next eligible date", () => {
  expect(claimCooldown([], NOW)).toEqual({ total: 0, recent: 0 });
  expect(claimCooldown([{ claimedAt: NOW - DAY }], NOW)).toEqual({
    total: 1,
    recent: 1,
  });
  // Two claims inside the window: wait until the older one ages out.
  expect(
    claimCooldown([{ claimedAt: NOW - 10 * DAY }, { claimedAt: NOW - DAY }], NOW)
  ).toEqual({ total: 2, recent: 2, eligibleAt: NOW - 10 * DAY + CLAIM_WINDOW_MS });
  // Three inside the window: the second-oldest must age out.
  expect(
    claimCooldown(
      [
        { claimedAt: NOW - 30 * DAY },
        { claimedAt: NOW - 10 * DAY },
        { claimedAt: NOW - DAY },
      ],
      NOW
    ).eligibleAt
  ).toBe(NOW - 10 * DAY + CLAIM_WINDOW_MS);
  // Claims older than 60 days and legacy claims without a date count in
  // the total but not toward the window.
  expect(
    claimCooldown(
      [{ claimedAt: NOW - 61 * DAY }, { claimedAt: NOW - 90 * DAY }, {}, { claimedAt: NOW - DAY }],
      NOW
    )
  ).toEqual({ total: 4, recent: 1 });
});

test("cooldownNotice wording", () => {
  expect(cooldownNotice({ recent: 2, eligibleAt: Date.UTC(2026, 9, 20, 12) })).toBe(
    "Already claimed 2 codes in the past 60 days, eligible again on Oct 20, 2026"
  );
});

const modules = import.meta.glob("../convex/**/*.ts");
const adminIdentity = { subject: "admin", email: "admin@example.com", emailVerified: true };
const attendee = { subject: "att", email: "Att@Example.com", emailVerified: true };
const attendeeKey = "att@example.com";

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("admins", { email: adminIdentity.email }));
  const admin = t.withIdentity(adminIdentity);
  const ids: Id<"events">[] = [];
  for (const slug of ["a", "b", "c"]) {
    const ev = await admin.mutation(api.events.create, { name: slug.toUpperCase(), slug });
    await admin.mutation(api.codes.add, { eventId: ev.id, codes: [`${slug}1`, `${slug}2`] });
    await t.run((ctx) => ctx.db.insert("emails", { eventId: ev.id, email: attendeeKey }));
    ids.push(ev.id);
  }
  return { t, admin, user: t.withIdentity(attendee), ids };
}

test("a third claim within 60 days is refused, existing codes stay retrievable", async () => {
  const { t, admin, user, ids } = await setup();
  expect(await user.mutation(api.claims.claim, { slug: "a" })).toMatchObject({ ok: true, code: "a1" });
  expect(await user.mutation(api.claims.claim, { slug: "b" })).toMatchObject({ ok: true, code: "b1" });

  const eligibility = await user.query(api.claims.eligibility, { slug: "c" });
  expect(eligibility).toMatchObject({ eligible: true, cooldown: { recent: 2 } });
  const eligibleAt =
    eligibility.eligible && "cooldown" in eligibility ? eligibility.cooldown?.eligibleAt : undefined;
  expect(eligibleAt).toBeGreaterThan(Date.now() + 59 * DAY);

  const third = await user.mutation(api.claims.claim, { slug: "c" });
  expect(third.ok).toBe(false);
  if (!third.ok) {
    expect(third.error).toMatch(/already claimed 2 codes in the past 60 days/);
    expect(third.error).toMatch(/already be in your account/);
  }
  await t.run(async (ctx) => {
    const codes = await ctx.db
      .query("codes")
      .withIndex("by_event", (q) => q.eq("eventId", ids[2]))
      .collect();
    expect(codes.every((c) => c.claimedBy === undefined)).toBe(true);
  });

  // Revisiting an event already claimed from returns that code, no refusal.
  expect(await user.mutation(api.claims.claim, { slug: "a" })).toMatchObject({
    ok: true,
    code: "a1",
    alreadyClaimed: true,
  });

  // The manage page lists the waiting attendee only on the event they
  // can't claim from yet.
  expect(await admin.query(api.emails.listCooldowns, { eventId: ids[2] })).toMatchObject({
    entries: [{ email: attendeeKey, recent: 2 }],
    hasMore: false,
  });
  expect(
    (await admin.query(api.emails.listCooldowns, { eventId: ids[0] })).entries
  ).toEqual([]);

  // Blocked participants can't claim at all, so they aren't listed as waiting.
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("emails")
      .withIndex("by_event_email", (q) => q.eq("eventId", ids[2]).eq("email", attendeeKey))
      .unique();
    await ctx.db.patch(row!._id, { blockedAt: Date.now(), blockedBy: "admin@example.com" });
  });
  expect(
    (await admin.query(api.emails.listCooldowns, { eventId: ids[2] })).entries
  ).toEqual([]);
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("emails")
      .withIndex("by_event_email", (q) => q.eq("eventId", ids[2]).eq("email", attendeeKey))
      .unique();
    await ctx.db.patch(row!._id, { blockedAt: undefined, blockedBy: undefined });
  });

  // Once one claim is older than 60 days the attendee can claim again.
  await t.run(async (ctx) => {
    const [a1] = await ctx.db
      .query("codes")
      .withIndex("by_event_claimedBy", (q) => q.eq("eventId", ids[0]).eq("claimedBy", attendeeKey))
      .collect();
    await ctx.db.patch(a1._id, { claimedAt: Date.now() - 61 * DAY });
  });
  expect(await user.query(api.claims.eligibility, { slug: "c" })).not.toHaveProperty("cooldown");
  expect(
    (await admin.query(api.emails.listCooldowns, { eventId: ids[2] })).entries
  ).toEqual([]);
  expect(await user.mutation(api.claims.claim, { slug: "c" })).toMatchObject({ ok: true, code: "c1" });
});

test("flagged entries report how many codes the identity has claimed before", async () => {
  const { admin, user } = await setup();
  await user.mutation(api.claims.claim, { slug: "a" });
  await user.mutation(api.claims.claim, { slug: "b" });
  const d = await admin.mutation(api.events.create, { name: "D", slug: "d" });
  await admin.mutation(api.emails.add, {
    eventId: d.id,
    emails: [attendeeKey, "fresh@example.com"],
  });
  const flagged = await admin.query(api.emails.listFlagged, { eventId: d.id });
  expect(flagged.entries).toHaveLength(1);
  expect(flagged.entries[0]).toMatchObject({ email: attendeeKey, claimCount: 2 });
});
