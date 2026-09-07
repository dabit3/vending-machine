import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

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
