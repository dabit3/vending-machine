import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { extractAdminEmails } from "../lib/admin-emails";
import { MAX_BULK_ADMINS } from "../lib/organizer-emails";

const modules = import.meta.glob("../convex/**/*.ts");
const identity = { subject: "admin-user", email: "admin@example.com", emailVerified: true };
const organizer = { subject: "org-user", email: "org@example.com", emailVerified: true };

function setup() {
  const t = convexTest(schema, modules);
  return { t, admin: t.withIdentity(identity), org: t.withIdentity(organizer) };
}

test("extractAdminEmails skips comments, names and blank lines between addresses", () => {
  expect(
    extractAdminEmails(
      [
        "# Speakers",
        "Alex@Example.com",
        "",
        "sam@example.com, pat@example.com; Jordan Lee <jordan@example.com>",
        "// volunteers (tbd)",
        "not-an-email @handle",
        "alex@example.com",
      ].join("\n"),
    ),
  ).toEqual(["alex@example.com", "sam@example.com", "pat@example.com", "jordan@example.com"]);
  expect(extractAdminEmails("")).toEqual([]);
});

test("admins.addMany adds new system admins and skips repeats, existing and invalid", async () => {
  const { t, admin } = setup();
  await t.run((ctx) => ctx.db.insert("admins", { email: identity.email }));
  const res = await admin.mutation(api.admins.addMany, {
    emails: ["A@example.com", "a@example.com", "b@example.com", "nope", identity.email],
  });
  expect(res).toEqual({ added: 2, skipped: 3 });
  expect((await admin.query(api.admins.list, {})).map((a) => a.email).sort()).toEqual([
    "a@example.com",
    "admin@example.com",
    "b@example.com",
  ]);
  await expect(
    admin.mutation(api.admins.addMany, {
      emails: Array.from({ length: MAX_BULK_ADMINS + 1 }, (_, i) => `u${i}@example.com`),
    }),
  ).rejects.toThrow(/at most/);
});

test("admins.addMany requires a system admin", async () => {
  const { t, org } = setup();
  await t.run((ctx) => ctx.db.insert("admins", { email: identity.email }));
  await expect(
    org.mutation(api.admins.addMany, { emails: ["x@example.com"] }),
  ).rejects.toThrow(/Not an admin/);
});

test("eventAdmins.addMany is scoped to events the caller manages", async () => {
  const { t, admin, org } = setup();
  await t.run((ctx) => ctx.db.insert("admins", { email: identity.email }));
  const mine = await admin.mutation(api.events.create, { name: "Mine" });
  const other = await admin.mutation(api.events.create, { name: "Other" });
  await admin.mutation(api.eventAdmins.add, { eventId: mine.id, email: organizer.email });

  const res = await org.mutation(api.eventAdmins.addMany, {
    eventId: mine.id,
    emails: ["# team", "One@example.com", "one@example.com", organizer.email, "bad"],
  });
  expect(res).toEqual({ added: 1, skipped: 4 });
  expect(
    (await org.query(api.eventAdmins.list, { eventId: mine.id })).map((a) => a.email).sort(),
  ).toEqual(["one@example.com", "org@example.com"]);

  await expect(
    org.mutation(api.eventAdmins.addMany, { eventId: other.id, emails: ["one@example.com"] }),
  ).rejects.toThrow(/Not an admin/);
  expect(await admin.query(api.eventAdmins.list, { eventId: other.id })).toEqual([]);
});
