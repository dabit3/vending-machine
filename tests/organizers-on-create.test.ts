import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import {
  MAX_ORGANIZERS_ON_CREATE,
  parseOrganizerEmails,
} from "../lib/organizer-emails";

const modules = import.meta.glob("../convex/**/*.ts");
const admin = {
  subject: "admin-user",
  email: "admin@example.com",
  emailVerified: true,
};
const organizer = {
  subject: "organizer-user",
  email: "organizer@example.com",
  emailVerified: true,
};

function setup() {
  const t = convexTest(schema, modules);
  return t.run(async (ctx) => {
    await ctx.db.insert("admins", { email: admin.email });
  }).then(() => t);
}

test("parseOrganizerEmails splits, normalizes, de-duplicates and flags bad entries", () => {
  expect(
    parseOrganizerEmails(" A@Example.com, b@example.com;\n a@example.com\tnot-an-email @handle "),
  ).toEqual({
    emails: ["a@example.com", "b@example.com"],
    invalid: ["not-an-email", "@handle"],
  });
  expect(parseOrganizerEmails("")).toEqual({ emails: [], invalid: [] });
});

test("organizers named on creation can manage the event right away", async () => {
  const t = await setup();
  const { id } = await t.withIdentity(admin).mutation(api.events.create, {
    name: "Launch",
    adminEmails: [" Organizer@Example.com ", "second@example.com", "organizer@example.com"],
  });
  const admins = await t.withIdentity(admin).query(api.eventAdmins.list, { eventId: id });
  expect(admins.map((a) => a.email).sort()).toEqual([
    "organizer@example.com",
    "second@example.com",
  ]);
  const user = t.withIdentity(organizer);
  expect(await user.query(api.admins.accessLevel)).toEqual({
    isGlobalAdmin: false,
    hasEventAccess: true,
  });
  await expect(user.query(api.events.get, { id })).resolves.toMatchObject({
    name: "Launch",
  });
});

test("creation without organizers assigns none", async () => {
  const t = await setup();
  const { id } = await t.withIdentity(admin).mutation(api.events.create, {
    name: "Solo",
    adminEmails: [],
  });
  expect(
    await t.withIdentity(admin).query(api.eventAdmins.list, { eventId: id }),
  ).toEqual([]);
});

test("invalid or too many organizer emails reject the whole creation", async () => {
  const t = await setup();
  const user = t.withIdentity(admin);
  await expect(
    user.mutation(api.events.create, {
      name: "Bad",
      adminEmails: ["organizer@example.com", "nope"],
    }),
  ).rejects.toThrow(/valid organizer email addresses: nope/);
  await expect(
    user.mutation(api.events.create, {
      name: "Many",
      adminEmails: Array.from(
        { length: MAX_ORGANIZERS_ON_CREATE + 1 },
        (_, i) => `person${i}@example.com`,
      ),
    }),
  ).rejects.toThrow(/up to 20 organizers/);
  expect(
    await t.run((ctx) => ctx.db.query("events").collect()),
  ).toEqual([]);
});
