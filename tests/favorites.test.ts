import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { MAX_FAVORITES } from "../convex/favorites";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
const adminIdentity = { subject: "admin", email: "admin@example.com", emailVerified: true };
const organizer = { subject: "org", email: "org@example.com", emailVerified: true };
const attendee = { subject: "att", email: "att@example.com", emailVerified: true };
const stranger = { subject: "str", email: "str@example.com", emailVerified: true };

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("admins", { email: adminIdentity.email }));
  const admin = t.withIdentity(adminIdentity);
  const run = await admin.mutation(api.events.create, {
    name: "Run",
    slug: "run",
    adminEmails: [organizer.email],
  });
  const other = await admin.mutation(api.events.create, { name: "Other", slug: "other" });
  await admin.mutation(api.emails.add, { eventId: run.id, emails: [attendee.email] });
  return {
    t,
    admin,
    run: run.id,
    other: other.id,
    org: t.withIdentity(organizer),
    user: t.withIdentity(attendee),
    outsider: t.withIdentity(stranger),
  };
}

test("a system admin stars any event and sees the flag on the dashboard list", async () => {
  const { admin, run, other } = await setup();
  await admin.mutation(api.favorites.set, { eventId: other, favorite: true });
  // Starring twice keeps one star.
  await admin.mutation(api.favorites.set, { eventId: other, favorite: true });
  const managed = await admin.query(api.events.listManaged, {});
  expect(managed.find((e) => e._id === other)?.favorite).toBe(true);
  expect(managed.find((e) => e._id === run)?.favorite).toBe(false);
  expect(await admin.query(api.favorites.mine, {})).toEqual([
    expect.objectContaining({ _id: other, slug: "other", manages: true }),
  ]);

  await admin.mutation(api.favorites.set, { eventId: other, favorite: false });
  expect(await admin.query(api.favorites.mine, {})).toEqual([]);
});

test("an organizer stars only the events they run", async () => {
  const { org, run, other } = await setup();
  await org.mutation(api.favorites.set, { eventId: run, favorite: true });
  await expect(
    org.mutation(api.favorites.set, { eventId: other, favorite: true }),
  ).rejects.toThrow(/Event not found/);
  expect(await org.query(api.favorites.mine, {})).toEqual([
    expect.objectContaining({ _id: run, manages: true }),
  ]);
  expect((await org.query(api.events.listManaged, {}))[0]).toMatchObject({
    _id: run,
    favorite: true,
  });
});

test("an attendee stars events they are on; stars are per account", async () => {
  const { user, org, outsider, run, other } = await setup();
  await user.mutation(api.favorites.set, { eventId: run, favorite: true });
  expect(await user.query(api.events.mine, {})).toEqual([
    expect.objectContaining({ _id: run, favorite: true }),
  ]);
  expect(await user.query(api.favorites.mine, {})).toEqual([
    expect.objectContaining({ _id: run, manages: false }),
  ]);
  // Someone else's star does not show for the organizer.
  expect((await org.query(api.events.listManaged, {}))[0].favorite).toBe(false);

  // Not on the list of either event: nothing can be starred, and the error
  // does not reveal whether the event exists.
  for (const eventId of [run, other]) {
    await expect(
      outsider.mutation(api.favorites.set, { eventId, favorite: true }),
    ).rejects.toThrow(/Event not found/);
  }
});

test("a claimant keeps starring rights after leaving the participant list", async () => {
  const { t, admin, user, run } = await setup();
  await admin.mutation(api.codes.add, { eventId: run, codes: ["C-1"] });
  await user.mutation(api.claims.claim, { slug: "run" });
  await t.run(async (ctx) => {
    for (const row of await ctx.db.query("emails").collect()) await ctx.db.delete(row._id);
  });
  await user.mutation(api.favorites.set, { eventId: run, favorite: true });
  expect(await user.query(api.favorites.mine, {})).toHaveLength(1);
});

test("a star on an event the viewer lost access to is hidden, and can still be removed", async () => {
  const { t, user, run } = await setup();
  await user.mutation(api.favorites.set, { eventId: run, favorite: true });
  await t.run(async (ctx) => {
    for (const row of await ctx.db.query("emails").collect()) {
      await ctx.db.patch(row._id, { blockedAt: 1 });
    }
  });
  expect(await user.query(api.favorites.mine, {})).toEqual([]);
  await user.mutation(api.favorites.set, { eventId: run, favorite: false });
  expect(await t.run((ctx) => ctx.db.query("eventFavorites").collect())).toEqual([]);
});

test("deleting an event removes its stars; signed-out visitors cannot star", async () => {
  const { t, admin, user, run } = await setup();
  await user.mutation(api.favorites.set, { eventId: run, favorite: true });
  await admin.mutation(api.favorites.set, { eventId: run, favorite: true });
  await expect(
    t.mutation(api.favorites.set, { eventId: run, favorite: true }),
  ).rejects.toThrow(/Sign in/);
  expect(await t.query(api.favorites.mine, {})).toEqual([]);

  await admin.mutation(api.events.remove, { id: run });
  expect(await t.run((ctx) => ctx.db.query("eventFavorites").collect())).toEqual([]);
});

test("at the limit, stars on events the viewer lost access to make room for new ones", async () => {
  const { t, org, admin, run, other } = await setup();
  // The organizer's allowance is full, one star short of it on an event they
  // have since been removed from.
  await t.run(async (ctx) => {
    for (let i = 0; i < MAX_FAVORITES - 1; i++) {
      const eventId = await ctx.db.insert("events", { name: `E${i}`, slug: `e${i}` });
      await ctx.db.insert("eventAdmins", { eventId, email: organizer.email });
      await ctx.db.insert("eventFavorites", { user: organizer.subject, eventId });
    }
    await ctx.db.insert("eventFavorites", { user: organizer.subject, eventId: other });
  });
  await org.mutation(api.favorites.set, { eventId: run, favorite: true });
  const stars = await t.run((ctx) => ctx.db.query("eventFavorites").collect());
  expect(stars).toHaveLength(MAX_FAVORITES);
  expect(stars.some((star) => star.eventId === other)).toBe(false);

  // With every star still visible, the limit holds.
  await t.run((ctx) => ctx.db.insert("eventAdmins", { eventId: other, email: organizer.email }));
  await expect(
    org.mutation(api.favorites.set, { eventId: other, favorite: true }),
  ).rejects.toThrow(/up to 100 events/);
  expect(await admin.query(api.favorites.mine, {})).toEqual([]);
});
