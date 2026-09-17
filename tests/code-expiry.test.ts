import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { codeExpiry } from "../lib/code-expiry";

const modules = import.meta.glob("../convex/**/*.ts");
const attendee = {
  subject: "attendee",
  email: "attendee@example.com",
  emailVerified: true,
};

async function setup() {
  const t = convexTest(schema, modules);
  const eventId = await t.run(async (ctx) => {
    const eventId = await ctx.db.insert("events", {
      name: "Expiring codes",
      slug: "expiry",
      codeTypes: ["Credits"],
    });
    await ctx.db.insert("emails", { eventId, email: attendee.email });
    await ctx.db.insert("codes", {
      eventId,
      code: "EXPIRED",
      codeType: "Credits",
      expiresAt: Date.now() - 1000,
    });
    await ctx.db.insert("codes", {
      eventId,
      code: "EXPIRED-RESERVED",
      codeType: "Credits",
      reservedFor: attendee.email,
      expiresAt: Date.now() - 1000,
    });
    return eventId;
  });
  return { t, eventId, user: t.withIdentity(attendee) };
}

test("expired codes are neither available nor claimable, including reservations", async () => {
  const { user } = await setup();
  expect(
    await user.query(api.events.getBySlug, { slug: "expiry" }),
  ).toMatchObject({ soldOut: true, codeTypes: [] });
  expect(
    await user.mutation(api.claims.claim, {
      slug: "expiry",
      codeType: "Credits",
    }),
  ).toMatchObject({ ok: false });
});

test.each([undefined, Date.now() + 86_400_000])(
  "claims a valid code after skipping expired codes: %s",
  async (expiresAt) => {
    const { t, eventId, user } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("codes", {
        eventId,
        code: "VALID",
        codeType: "Credits",
        expiresAt,
      });
    });
    expect(
      await user.query(api.events.getBySlug, { slug: "expiry" }),
    ).toMatchObject({ soldOut: false, codeTypes: ["Credits"] });
    expect(
      await user.mutation(api.claims.claim, {
        slug: "expiry",
        codeType: "Credits",
      }),
    ).toMatchObject({ ok: true, code: "VALID" });
  },
);

test("claim responses carry the code's expiry so attendees can see it", async () => {
  const { t, eventId, user } = await setup();
  const expiresAt = Date.now() + 86_400_000;
  await t.run(async (ctx) => {
    await ctx.db.insert("codes", {
      eventId,
      code: "VALID",
      codeType: "Credits",
      expiresAt,
    });
  });
  expect(
    await user.mutation(api.claims.claim, { slug: "expiry", codeType: "Credits" }),
  ).toMatchObject({ ok: true, alreadyClaimed: false, expiresAt });
  expect(
    await user.query(api.claims.eligibility, { slug: "expiry" }),
  ).toMatchObject({ claimed: { code: "VALID", expiresAt } });
  expect(await user.mutation(api.claims.claim, { slug: "expiry" })).toMatchObject({
    alreadyClaimed: true,
    expiresAt,
  });
  expect(await user.query(api.codes.mine, {})).toMatchObject([
    { code: "VALID", expiresAt },
  ]);
});

test("admin preview reports the expiry of the next code an attendee would get", async () => {
  const { t, eventId } = await setup();
  const expiresAt = Date.now() + 86_400_000;
  await t.run(async (ctx) => {
    await ctx.db.insert("admins", { email: "admin@example.com" });
    await ctx.db.patch(eventId, { codeTypes: ["Credits", "Team"] });
    await ctx.db.insert("codes", {
      eventId,
      code: "VALID",
      codeType: "Credits",
      expiresAt,
    });
    await ctx.db.insert("codes", { eventId, code: "TEAM", codeType: "Team" });
  });
  const admin = t.withIdentity({
    subject: "admin",
    email: "admin@example.com",
    emailVerified: true,
  });
  expect(
    await admin.query(api.claims.eligibility, { slug: "expiry", preview: true }),
  ).toMatchObject({
    preview: true,
    previewCodes: [{ codeType: "Credits", expiresAt }, { codeType: "Team" }],
  });
  expect(await t.run((ctx) => ctx.db.query("codes").collect())).toHaveLength(4);
});

test("codeExpiry tells attendees when to redeem by, or that the code expired", () => {
  const now = new Date(2026, 8, 17).getTime();
  expect(codeExpiry(undefined, now)).toBeNull();
  expect(codeExpiry(new Date(2026, 9, 31, 23, 59, 59).getTime(), now)).toEqual({
    label: "Redeem by October 31, 2026",
    expired: false,
  });
  expect(codeExpiry(new Date(2026, 0, 5).getTime(), now)).toEqual({
    label: "Expired January 5, 2026",
    expired: true,
  });
});
