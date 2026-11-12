import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { mutationError } from "../lib/stripe-form";

const modules = import.meta.glob("../convex/**/*.ts");
const sysAdmin = { subject: "admin", email: "admin@example.com", emailVerified: true };
const organizer = { subject: "org", email: "org@example.com", emailVerified: true };
const stranger = { subject: "str", email: "str@example.com", emailVerified: true };

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("admins", { email: sysAdmin.email }));
  const admin = t.withIdentity(sysAdmin);
  const { id } = await admin.mutation(api.events.create, {
    name: "Meetup",
    slug: "meetup",
    description: "Monthly",
  });
  await t.run((ctx) =>
    ctx.db.insert("eventAdmins", { eventId: id, email: organizer.email })
  );
  return { t, admin, id };
}

test("an organizer renames the event; the claim URL and other details stay", async () => {
  const { t, id } = await setup();
  const result = await t
    .withIdentity(organizer)
    .mutation(api.events.rename, { id, name: "  Meetup, November  " });
  expect(result).toEqual({ name: "Meetup, November" });
  const event = await t.query(api.events.getBySlug, { slug: "meetup" });
  expect(event).toMatchObject({ name: "Meetup, November", description: "Monthly" });
});

test("a blank name is refused with a readable message", async () => {
  const { t, admin, id } = await setup();
  const error = await admin
    .mutation(api.events.rename, { id, name: "   " })
    .catch((err: unknown) => err);
  expect(mutationError(error, "fallback")).toBe("Enter a name for the event.");
  expect((await t.query(api.events.getBySlug, { slug: "meetup" }))?.name).toBe("Meetup");
});

test("someone who does not manage the event cannot rename it", async () => {
  const { t, id } = await setup();
  await expect(
    t.withIdentity(stranger).mutation(api.events.rename, { id, name: "Hijacked" })
  ).rejects.toThrow();
  await expect(t.mutation(api.events.rename, { id, name: "Hijacked" })).rejects.toThrow();
  expect((await t.query(api.events.getBySlug, { slug: "meetup" }))?.name).toBe("Meetup");
});
