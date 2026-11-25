import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

const globalAdmin = {
  subject: "admin-1",
  email: "admin@cognition.ai",
  emailVerified: true,
};

const eventAdmin = {
  subject: "org-1",
  email: "organizer@cognition.ai",
  emailVerified: true,
};

const attendee = {
  subject: "att-1",
  email: "attendee@example.com",
  emailVerified: true,
};

async function setup() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("admins", { email: "admin@cognition.ai" });
  });
  return {
    t,
    admin: t.withIdentity(globalAdmin),
    organizer: t.withIdentity(eventAdmin),
    guest: t.withIdentity(attendee),
  };
}

test("adminNote is stored, editable, visible to admins, and never leaked to public queries", async () => {
  const { t, admin, organizer, guest } = await setup();
  const { id, slug } = await admin.mutation(api.events.create, {
    name: "Acme Workshop",
    description: "Public welcome message",
    adminNote: "  Created for Acme sales workshop — requested in #partnerships  ",
    adminEmails: ["organizer@cognition.ai"],
  });

  // Global admin and event admin both see adminNote in events.get and listManaged.
  const asGlobal = await admin.query(api.events.get, { id });
  expect(asGlobal?.adminNote).toBe(
    "Created for Acme sales workshop — requested in #partnerships",
  );
  const asOrganizer = await organizer.query(api.events.get, { id });
  expect(asOrganizer?.adminNote).toBe(
    "Created for Acme sales workshop — requested in #partnerships",
  );
  const managed = await organizer.query(api.events.listManaged, {});
  expect(managed[0]?.adminNote).toBe(
    "Created for Acme sales workshop — requested in #partnerships",
  );

  // Public getBySlug and attendee events.mine never expose adminNote.
  await admin.mutation(api.emails.add, {
    eventId: id,
    emails: ["attendee@example.com"],
  });
  const publicAnon = await t.query(api.events.getBySlug, { slug });
  expect(publicAnon).not.toBeNull();
  expect("adminNote" in (publicAnon ?? {})).toBe(false);

  const publicAttendee = await guest.query(api.events.getBySlug, { slug });
  expect("adminNote" in (publicAttendee ?? {})).toBe(false);

  const myEvents = await guest.query(api.events.mine, {});
  expect(myEvents).not.toBeNull();
  expect(myEvents).toHaveLength(1);
  expect("adminNote" in myEvents![0]).toBe(false);

  // Non-admins cannot call events.get.
  await expect(guest.query(api.events.get, { id })).rejects.toThrow();

  // Omitting adminNote on update preserves the existing value.
  await organizer.mutation(api.events.update, {
    id,
    name: "Acme Workshop Renamed",
    slug,
  });
  expect((await admin.query(api.events.get, { id }))?.adminNote).toBe(
    "Created for Acme sales workshop — requested in #partnerships",
  );

  // Updating adminNote changes it; passing empty string clears it.
  await organizer.mutation(api.events.update, {
    id,
    name: "Acme Workshop Renamed",
    slug,
    adminNote: "Updated context: 50 Pro codes from Q4 budget.",
  });
  expect((await admin.query(api.events.get, { id }))?.adminNote).toBe(
    "Updated context: 50 Pro codes from Q4 budget.",
  );

  await organizer.mutation(api.events.update, {
    id,
    name: "Acme Workshop Renamed",
    slug,
    adminNote: "   ",
  });
  expect((await admin.query(api.events.get, { id }))?.adminNote).toBeUndefined();
});
