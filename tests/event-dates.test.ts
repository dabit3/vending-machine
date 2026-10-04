import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import {
  daysSinceEventEnded,
  eventCountdownLabel,
  formatEventDateRange,
  isEventLive,
} from "../lib/event-date";

const modules = import.meta.glob("../convex/**/*.ts");
const identity = {
  subject: "admin",
  email: "admin@example.com",
  emailVerified: true,
};

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("admins", { email: identity.email }));
  return { t, admin: t.withIdentity(identity) };
}

test("formats single-day and multi-day event dates", () => {
  expect(formatEventDateRange("2026-10-10")).toBe("Oct 10, 2026");
  expect(formatEventDateRange("2026-10-10", "2026-10-12")).toBe("Oct 10 – 12, 2026");
  expect(formatEventDateRange("2026-10-30", "2026-11-02")).toBe("Oct 30 – Nov 2, 2026");
  expect(formatEventDateRange("2026-12-30", "2027-01-02")).toBe(
    "Dec 30, 2026 – Jan 2, 2027"
  );
  expect(formatEventDateRange("2026-10-10", "2026-10-10")).toBe("Oct 10, 2026");
});

test("a multi-day event is live on every day and ends after its last day", () => {
  const on = (day: number) => new Date(2026, 9, day, 12);
  expect(isEventLive("2026-10-10", "2026-10-12", on(9))).toBe(false);
  expect(eventCountdownLabel("2026-10-10", on(9))).toBe("Tomorrow");
  expect(isEventLive("2026-10-10", "2026-10-12", on(10))).toBe(true);
  expect(isEventLive("2026-10-10", "2026-10-12", on(12))).toBe(true);
  expect(daysSinceEventEnded("2026-10-10", "2026-10-12", on(12))).toBe(0);
  expect(isEventLive("2026-10-10", "2026-10-12", on(13))).toBe(false);
  expect(daysSinceEventEnded("2026-10-10", "2026-10-12", on(13))).toBe(1);
  expect(isEventLive("2026-10-10", undefined, on(10))).toBe(true);
  expect(daysSinceEventEnded("2026-10-10", undefined, on(11))).toBe(1);
});

test("create and update store an end date only after the start", async () => {
  const { t, admin } = await setup();
  const { id } = await admin.mutation(api.events.create, {
    name: "Summit",
    eventDate: "2026-10-10",
    eventEndDate: "2026-10-12",
  });
  const read = () => t.run((ctx) => ctx.db.get(id));
  expect(await read()).toMatchObject({ eventDate: "2026-10-10", eventEndDate: "2026-10-12" });

  const base = { id, name: "Summit", slug: "summit" };
  // Older forms omit eventEndDate: the stored end date is kept.
  await admin.mutation(api.events.update, { ...base, eventDate: "2026-10-11" });
  expect(await read()).toMatchObject({ eventDate: "2026-10-11", eventEndDate: "2026-10-12" });
  // Moving the start onto or past the end drops it.
  await admin.mutation(api.events.update, { ...base, eventDate: "2026-10-12" });
  expect((await read())?.eventEndDate).toBeUndefined();

  await admin.mutation(api.events.update, {
    ...base,
    eventDate: "2026-10-10",
    eventEndDate: "2026-10-14",
  });
  expect((await read())?.eventEndDate).toBe("2026-10-14");
  await admin.mutation(api.events.update, { ...base, eventDate: "2026-10-10", eventEndDate: "" });
  expect((await read())?.eventEndDate).toBeUndefined();
  // No start date means no end date.
  await admin.mutation(api.events.update, { ...base, eventEndDate: "2026-10-14" });
  const undated = await read();
  expect(undated?.eventDate).toBeUndefined();
  expect(undated?.eventEndDate).toBeUndefined();
  await expect(
    admin.mutation(api.events.update, { ...base, eventDate: "2026-10-10", eventEndDate: "soon" })
  ).rejects.toThrow("valid event date");
  await expect(
    admin.mutation(api.events.update, { ...base, eventDate: "2026-02-10", eventEndDate: "2026-02-30" })
  ).rejects.toThrow("valid event date");
  await expect(
    admin.mutation(api.events.update, { ...base, eventDate: "2026-02-30" })
  ).rejects.toThrow("valid event date");
});

test("legacy single-date events read back without an end date", async () => {
  const { t, admin } = await setup();
  const id = await t.run((ctx) =>
    ctx.db.insert("events", { name: "Old", slug: "old", eventDate: "2026-07-01" })
  );
  const event = await admin.query(api.events.get, { id });
  expect(event?.eventDate).toBe("2026-07-01");
  expect(event?.eventEndDate).toBeUndefined();
});
