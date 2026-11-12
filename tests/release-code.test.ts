import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { mutationError } from "../lib/stripe-form";

const modules = import.meta.glob("../convex/**/*.ts");
const organizer = { subject: "org", email: "org@example.com", emailVerified: true };
const attendee = { subject: "att", email: "att@example.com", emailVerified: true };
const other = { subject: "oth", email: "oth@example.com", emailVerified: true };

async function setup({ dynamic = false, codes = ["A", "B"] } = {}) {
  const t = convexTest(schema, modules);
  const eventId = await t.run(async (ctx) => {
    const eventId = await ctx.db.insert("events", {
      name: "Meetup",
      slug: "meetup",
      dynamic: dynamic || undefined,
    });
    for (const code of codes) await ctx.db.insert("codes", { eventId, code });
    await ctx.db.insert("eventAdmins", { eventId, email: organizer.email });
    if (!dynamic) {
      await ctx.db.insert("emails", { eventId, email: attendee.email });
      await ctx.db.insert("emails", { eventId, email: other.email });
    }
    return eventId;
  });
  const admin = t.withIdentity(organizer);
  const codeId = async (code: string) =>
    (await admin.query(api.codes.list, { eventId })).find((c) => c.code === code)!._id;
  return { t, eventId, admin, codeId, user: t.withIdentity(attendee), second: t.withIdentity(other) };
}

test("an event admin releases a claimed code back to the pool", async () => {
  const { t, eventId, admin, codeId, user, second } = await setup({ codes: ["A"] });
  expect(await user.mutation(api.claims.claim, { slug: "meetup" })).toMatchObject({ ok: true, code: "A" });
  expect(await second.mutation(api.claims.claim, { slug: "meetup" })).toMatchObject({ ok: false });

  expect(await admin.mutation(api.codes.release, { id: await codeId("A") })).toEqual({
    released: true,
    claimedBy: attendee.email,
  });
  const [code] = await admin.query(api.codes.list, { eventId });
  expect(code.claimedBy).toBeUndefined();
  expect(code.claimedAt).toBeUndefined();
  expect(await user.query(api.codes.mine, {})).toEqual([]);
  // The attendee stays on the list, and the code can go to someone else.
  expect((await admin.query(api.emails.list, { eventId })).map((e) => e.email)).toContain(attendee.email);
  expect(await second.mutation(api.claims.claim, { slug: "meetup" })).toMatchObject({
    ok: true,
    code: "A",
    alreadyClaimed: false,
  });
  const logs = await t.run((ctx) => ctx.db.query("auditLogs").collect());
  expect(logs).toContainEqual(
    expect.objectContaining({
      action: "code_released",
      actorEmail: organizer.email,
      subjectEmail: attendee.email,
    })
  );
});

test("releasing is limited to the event's admins and ignores unclaimed codes", async () => {
  const { admin, codeId, user } = await setup();
  await user.mutation(api.claims.claim, { slug: "meetup" });
  await expect(user.mutation(api.codes.release, { id: await codeId("A") })).rejects.toThrow();
  expect(await admin.mutation(api.codes.release, { id: await codeId("B") })).toEqual({ released: false });
});

test("a released claim no longer counts toward the 60-day limit", async () => {
  const { t, admin, codeId, user } = await setup();
  await t.run(async (ctx) => {
    for (const slug of ["one", "two"]) {
      const eventId = await ctx.db.insert("events", { name: slug, slug });
      await ctx.db.insert("emails", { eventId, email: attendee.email });
      await ctx.db.insert("codes", { eventId, code: `${slug}-1` });
    }
  });
  await user.mutation(api.claims.claim, { slug: "meetup" });
  await user.mutation(api.claims.claim, { slug: "one" });
  expect(await user.mutation(api.claims.claim, { slug: "two" })).toMatchObject({ ok: false });
  await admin.mutation(api.codes.release, { id: await codeId("A") });
  expect(await user.mutation(api.claims.claim, { slug: "two" })).toMatchObject({ ok: true, code: "two-1" });
});

test("releasing a dynamic event's code takes the claimant off the event", async () => {
  const { eventId, admin, codeId, user } = await setup({ dynamic: true });
  await user.mutation(api.claims.claim, { slug: "meetup", name: "Test Attendee" });
  expect((await user.query(api.events.mine, {}))?.map((e) => e.slug)).toEqual(["meetup"]);
  await admin.mutation(api.codes.release, { id: await codeId("A") });
  expect(await admin.query(api.emails.list, { eventId })).toEqual([]);
  expect(await user.query(api.events.mine, {})).toEqual([]);
  expect(await user.mutation(api.claims.claim, { slug: "meetup", name: "Test Attendee" })).toMatchObject({
    ok: true,
    alreadyClaimed: false,
  });
});

test("in a two-code event, releasing one code lets the attendee collect that block again", async () => {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("admins", { email: organizer.email }));
  const admin = t.withIdentity(organizer);
  const event = await admin.mutation(api.events.create, {
    name: "Launch",
    slug: "launch",
    claimMode: "all",
    codeBlocks: [
      { name: "Max plan", value: "200", codes: ["MAX-1"] },
      { name: "On-demand usage", value: "5000", codes: ["USE-1"] },
    ],
  });
  await admin.mutation(api.emails.add, { eventId: event.id, emails: [attendee.email] });
  const user = t.withIdentity(attendee);
  await user.mutation(api.claims.claim, { slug: "launch" });
  const codes = await admin.query(api.codes.list, { eventId: event.id });
  await admin.mutation(api.codes.release, { id: codes.find((c) => c.code === "USE-1")!._id });
  expect((await user.query(api.codes.mine, {}))?.map((c) => c.code)).toEqual(["MAX-1"]);
  const again = await user.mutation(api.claims.claim, { slug: "launch" });
  if (!again.ok) throw new Error("claim failed");
  expect(again.codes.map((c) => c.code).sort()).toEqual(["MAX-1", "USE-1"]);
});

test("a confirmation for an earlier claimant does not release a newer claim", async () => {
  const { eventId, admin, codeId, user, second } = await setup({ codes: ["A"] });
  await user.mutation(api.claims.claim, { slug: "meetup" });
  const id = await codeId("A");
  await admin.mutation(api.codes.release, { id, claimedBy: attendee.email });
  await second.mutation(api.claims.claim, { slug: "meetup" });
  // A ConvexError, so the manage page can show the reason in its toast.
  const error = await admin
    .mutation(api.codes.release, { id, claimedBy: attendee.email })
    .catch((err: unknown) => err);
  expect(mutationError(error, "fallback")).toBe(
    "A is now claimed by oth@example.com, not att@example.com. Nothing was released."
  );
  const [code] = await admin.query(api.codes.list, { eventId });
  expect(code.claimedBy).toBe(other.email);
});
