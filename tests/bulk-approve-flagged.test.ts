import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { bulkApproveFlagged } from "../lib/bulk-approve-flagged";

const modules = import.meta.glob("../convex/**/*.ts");
const ids = (count: number) =>
  Array.from({ length: count }, (_, i) => `flag-${i}` as Id<"flaggedEmails">);

test("only submits the supplied snapshot, once per entry, with bounded concurrency", async () => {
  const snapshot = ids(23);
  const waiting: (() => void)[] = [];
  const approve = vi.fn(() => new Promise<void>((resolve) => waiting.push(resolve)));
  const result = bulkApproveFlagged([...snapshot, snapshot[0]], approve);
  expect(approve).toHaveBeenCalledTimes(10);
  waiting.splice(0).forEach((resolve) => resolve());
  await vi.waitFor(() => expect(approve).toHaveBeenCalledTimes(20));
  waiting.splice(0).forEach((resolve) => resolve());
  await vi.waitFor(() => expect(approve).toHaveBeenCalledTimes(23));
  waiting.splice(0).forEach((resolve) => resolve());
  expect(await result).toEqual({ approved: 23, failed: 0 });
  expect(approve.mock.calls).toEqual(snapshot.map((id) => [{ id }]));
});

test("continues after failures and reports partial or total failure", async () => {
  const snapshot = ids(12);
  const approve = vi.fn(async ({ id }: { id: Id<"flaggedEmails"> }) => {
    if (id === snapshot[0] || id === snapshot[10]) throw new Error("Rejected");
  });
  expect(await bulkApproveFlagged(snapshot, approve)).toEqual({ approved: 10, failed: 2 });
  expect(approve).toHaveBeenCalledTimes(12);
  expect(await bulkApproveFlagged(snapshot, () => { throw new Error("Offline"); }))
    .toEqual({ approved: 0, failed: 12 });
});

test("an empty list makes no requests", async () => {
  const approve = vi.fn();
  expect(await bulkApproveFlagged([], approve)).toEqual({ approved: 0, failed: 0 });
  expect(approve).not.toHaveBeenCalled();
});

test("uses existing event authorization, blacklist protection and per-entry audit logs", async () => {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("admins", { email: "admin@example.com" }));
  const admin = t.withIdentity({
    subject: "admin", email: "admin@example.com", emailVerified: true,
  });
  const event = await admin.mutation(api.events.create, { name: "Meetup" });
  const other = await admin.mutation(api.events.create, { name: "Other" });
  const flagged = await t.run(async (ctx) => {
    await ctx.db.insert("eventAdmins", { eventId: event.id, email: "organizer@example.com" });
    await ctx.db.insert("blacklistedEmails", { email: "blocked@example.com" });
    return await Promise.all([
      [event.id, "one@example.com"],
      [event.id, "blocked@example.com"],
      [other.id, "other@example.com"],
    ].map(([eventId, email]) => ctx.db.insert("flaggedEmails", {
      eventId: eventId as Id<"events">, email, matchedEventIds: [],
    })));
  });
  const organizer = t.withIdentity({
    subject: "organizer", email: "organizer@example.com", emailVerified: true,
  });
  expect(await bulkApproveFlagged(flagged, (args) => organizer.mutation(api.emails.approveFlagged, args)))
    .toEqual({ approved: 1, failed: 2 });
  expect((await admin.query(api.emails.list, { eventId: event.id })).map((entry) => entry.email))
    .toEqual(["one@example.com"]);
  expect(await admin.query(api.emails.list, { eventId: other.id })).toEqual([]);
  const remaining = await t.run((ctx) => ctx.db.query("flaggedEmails").collect());
  expect(remaining.map((entry) => entry.email).sort()).toEqual(["blocked@example.com", "other@example.com"]);
  const logs = await admin.query(api.auditLog.list, { eventId: event.id });
  expect(logs.filter((entry) => entry.action === "flagged_email_approved"))
    .toMatchObject([{ subjectEmail: "one@example.com", actorEmail: "organizer@example.com" }]);
  expect(await bulkApproveFlagged([flagged[2]], (args) => t.mutation(api.emails.approveFlagged, args)))
    .toEqual({ approved: 0, failed: 1 });
});
