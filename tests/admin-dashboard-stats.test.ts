import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import type { Id } from "../convex/_generated/dataModel";

const stripe = vi.hoisted(() => ({
  list: vi.fn(),
  retrieve: vi.fn(),
}));
vi.mock("stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("stripe")>();
  class FakeStripe {
    static errors = actual.default.errors;
    promotionCodes = {
      list: stripe.list,
      retrieve: stripe.retrieve,
    };
  }
  return { default: FakeStripe };
});

const modules = import.meta.glob("../convex/**/*.ts");
const globalIdentity = {
  subject: "global-admin",
  email: "admin@example.com",
  emailVerified: true,
};
const eventAdminIdentity = {
  subject: "event-admin",
  email: "organizer@example.com",
  emailVerified: true,
};
const outsiderIdentity = {
  subject: "outsider",
  email: "outsider@example.com",
  emailVerified: true,
};

async function drain(t: ReturnType<typeof convexTest>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("STRIPE_API_KEY", "sk_test_mock_not_a_real_key");
  stripe.list.mockReset();
  stripe.retrieve.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test("dashboardStats computes remaining codes, queues, and enforces admin scope", async () => {
  const t = convexTest(schema, modules);
  await t.run((ctx) =>
    ctx.db.insert("admins", { email: globalIdentity.email }),
  );
  const admin = t.withIdentity(globalIdentity);
  const ev1 = await admin.mutation(api.events.create, { name: "Event One" });
  const ev2 = await admin.mutation(api.events.create, { name: "Event Two" });

  await t.run(async (ctx) => {
    await ctx.db.insert("eventAdmins", {
      eventId: ev1.id,
      email: eventAdminIdentity.email,
    });
    // Event One: 1 available, 1 claimed, 1 expired, 1 in archived block -> 1 remaining of 4
    await ctx.db.patch(ev1.id, {
      codeTypes: ["Main", "Old"],
      archivedCodeTypes: ["Old"],
    });
    await ctx.db.insert("codes", {
      eventId: ev1.id,
      code: "OPEN-1",
      codeType: "Main",
    });
    await ctx.db.insert("codes", {
      eventId: ev1.id,
      code: "CLAIMED-1",
      codeType: "Main",
      claimedBy: "a@example.com",
      claimedAt: Date.now(),
    });
    await ctx.db.insert("codes", {
      eventId: ev1.id,
      code: "EXPIRED-1",
      codeType: "Main",
      expiresAt: Date.now() - 60_000,
    });
    await ctx.db.insert("codes", {
      eventId: ev1.id,
      code: "ARCHIVED-1",
      codeType: "Old",
    });

    // 2 pending requests, 1 approved, 1 denied -> 2 pendingRequests
    await ctx.db.insert("accessRequests", {
      eventId: ev1.id,
      email: "req1@example.com",
      status: "pending",
    });
    await ctx.db.insert("accessRequests", {
      eventId: ev1.id,
      email: "req2@example.com",
      status: "pending",
    });
    await ctx.db.insert("accessRequests", {
      eventId: ev1.id,
      email: "req3@example.com",
      status: "approved",
    });
    await ctx.db.insert("accessRequests", {
      eventId: ev1.id,
      email: "req4@example.com",
      status: "denied",
    });

    // 1 flagged entry
    await ctx.db.insert("flaggedEmails", {
      eventId: ev1.id,
      email: "dup@example.com",
      matchedEventIds: [ev2.id],
    });

    // Event Two: 2 unclaimed codes
    await ctx.db.insert("codes", { eventId: ev2.id, code: "EV2-1" });
    await ctx.db.insert("codes", { eventId: ev2.id, code: "EV2-2" });
  });

  // Global admin sees both events.
  const allStats = await admin.query(api.events.dashboardStats, {
    eventIds: [ev1.id, ev2.id],
  });
  expect(allStats[ev1.id]).toMatchObject({
    totalCodes: 4,
    claimedCodes: 1,
    remainingCodes: 1,
    pendingRequests: 2,
    flaggedCount: 1,
    stripeClaimedCodes: 0,
    stripeRedeemedCodes: 0,
    stripeSyncedCodes: 0,
  });
  expect(allStats[ev2.id]).toMatchObject({
    totalCodes: 2,
    claimedCodes: 0,
    remainingCodes: 2,
    pendingRequests: 0,
    flaggedCount: 0,
  });

  // Event admin only sees ev1, never ev2.
  const organizer = t.withIdentity(eventAdminIdentity);
  const orgStats = await organizer.query(api.events.dashboardStats, {
    eventIds: [ev1.id, ev2.id],
  });
  expect(Object.keys(orgStats)).toEqual([ev1.id]);

  // Outsider sees nothing.
  const outsider = t.withIdentity(outsiderIdentity);
  expect(
    await outsider.query(api.events.dashboardStats, {
      eventIds: [ev1.id, ev2.id],
    }),
  ).toEqual({});
});

test("syncStripeRedemptions checks claimed Stripe codes via coupon list and updates stats", async () => {
  const t = convexTest(schema, modules);
  await t.run((ctx) =>
    ctx.db.insert("admins", { email: globalIdentity.email }),
  );
  const admin = t.withIdentity(globalIdentity);
  const ev = await admin.mutation(api.events.create, { name: "Stripe Event" });

  await t.run(async (ctx) => {
    await ctx.db.insert("eventAdmins", {
      eventId: ev.id,
      email: eventAdminIdentity.email,
    });
    const batchId: Id<"stripeBatches"> = await ctx.db.insert("stripeBatches", {
      name: "Promo Batch",
      prefix: "DEV",
      amountCents: 2000,
      quantity: 3,
      live: false,
      createdBy: globalIdentity.email,
      requestId: "req-1",
      requestFingerprint: "fp-1",
      status: "complete",
      version: 1,
      couponId: "vm_coupon_1",
      codes: [
        { id: "promo_1", code: "DEV-1" },
        { id: "promo_2", code: "DEV-2" },
        { id: "promo_3", code: "DEV-3" },
      ],
      eventId: ev.id,
      targetEventId: ev.id,
    });
    // Two claimed Stripe codes + one unclaimed Stripe code + one manual claimed code
    await ctx.db.insert("codes", {
      eventId: ev.id,
      code: "DEV-1",
      stripeBatchId: batchId,
      claimedBy: "u1@example.com",
      claimedAt: Date.now(),
    });
    await ctx.db.insert("codes", {
      eventId: ev.id,
      code: "DEV-2",
      stripeBatchId: batchId,
      claimedBy: "u2@example.com",
      claimedAt: Date.now(),
    });
    await ctx.db.insert("codes", {
      eventId: ev.id,
      code: "DEV-3",
      stripeBatchId: batchId,
    });
    await ctx.db.insert("codes", {
      eventId: ev.id,
      code: "MANUAL-1",
      claimedBy: "u3@example.com",
      claimedAt: Date.now(),
    });
  });

  // Event admins cannot trigger Stripe operations.
  const organizer = t.withIdentity(eventAdminIdentity);
  await expect(
    organizer.mutation(api.codes.syncStripeRedemptions, { eventId: ev.id }),
  ).rejects.toThrow();

  // Mock paginated list response from Stripe.
  stripe.list
    .mockResolvedValueOnce({
      data: [{ id: "promo_1", code: "DEV-1", times_redeemed: 1 }],
      has_more: true,
    })
    .mockResolvedValueOnce({
      data: [{ id: "promo_2", code: "DEV-2", times_redeemed: 0 }],
      has_more: false,
    });

  const started = await admin.mutation(api.codes.syncStripeRedemptions, {
    eventId: ev.id,
  });
  expect(started).toEqual({ stripeCodes: 2 });
  await drain(t);

  expect(stripe.list).toHaveBeenCalledTimes(2);
  expect(stripe.list).toHaveBeenNthCalledWith(1, {
    coupon: "vm_coupon_1",
    limit: 100,
  });
  expect(stripe.list).toHaveBeenNthCalledWith(2, {
    coupon: "vm_coupon_1",
    limit: 100,
    starting_after: "promo_1",
  });

  const codes = await admin.query(api.codes.list, { eventId: ev.id });
  const dev1 = codes.find((c) => c.code === "DEV-1");
  const dev2 = codes.find((c) => c.code === "DEV-2");
  const dev3 = codes.find((c) => c.code === "DEV-3");
  expect(dev1?.stripeTimesRedeemed).toBe(1);
  expect(dev1?.stripeRedemptionSyncedAt).toBeDefined();
  expect(dev2?.stripeTimesRedeemed).toBe(0);
  expect(dev2?.stripeRedemptionSyncedAt).toBeDefined();
  expect(dev3?.stripeTimesRedeemed).toBeUndefined();

  const stats = await admin.query(api.events.dashboardStats, {
    eventIds: [ev.id],
  });
  expect(stats[ev.id]).toMatchObject({
    totalCodes: 4,
    claimedCodes: 3,
    remainingCodes: 1,
    stripeClaimedCodes: 2,
    stripeRedeemedCodes: 1,
    stripeSyncedCodes: 2,
    stripeRedemptionSyncStatus: "done",
  });

  const auditActions = (
    await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_event", (q) => q.eq("eventId", ev.id))
        .collect(),
    )
  ).map((a) => a.action);
  expect(auditActions).toContain("stripe_redemptions_synced");
});

test("syncStripeRedemptions falls back to retrieve without couponId and strips errors for event admins", async () => {
  const t = convexTest(schema, modules);
  await t.run((ctx) =>
    ctx.db.insert("admins", { email: globalIdentity.email }),
  );
  const admin = t.withIdentity(globalIdentity);
  const ev = await admin.mutation(api.events.create, { name: "Legacy Batch" });

  await t.run(async (ctx) => {
    await ctx.db.insert("eventAdmins", {
      eventId: ev.id,
      email: eventAdminIdentity.email,
    });
    const batchId: Id<"stripeBatches"> = await ctx.db.insert("stripeBatches", {
      name: "No Coupon",
      prefix: "OLD",
      amountCents: 1000,
      quantity: 1,
      live: true, // mismatch with sk_test_ key!
      createdBy: globalIdentity.email,
      requestId: "req-2",
      requestFingerprint: "fp-2",
      status: "complete",
      version: 1,
      codes: [{ id: "promo_old", code: "OLD-1" }],
      eventId: ev.id,
      targetEventId: ev.id,
    });
    await ctx.db.insert("codes", {
      eventId: ev.id,
      code: "OLD-1",
      stripeBatchId: batchId,
      claimedBy: "u@example.com",
      claimedAt: Date.now(),
    });
  });

  await admin.mutation(api.codes.syncAllStripeRedemptions, {
    eventIds: [ev.id],
  });
  await drain(t);

  const globalEvent = await admin.query(api.events.get, { id: ev.id });
  expect(globalEvent?.stripeRedemptionSync?.status).toBe("failed");
  expect(globalEvent?.stripeRedemptionSync?.error).toContain("live mode");

  // Event admin sees status but not raw Stripe error text (neither on the event nor in audit logs).
  const organizer = t.withIdentity(eventAdminIdentity);
  const orgEvent = await organizer.query(api.events.get, { id: ev.id });
  expect(orgEvent?.stripeRedemptionSync?.status).toBe("failed");
  expect(orgEvent?.stripeRedemptionSync?.error).toBeUndefined();

  const auditLogs = await organizer.query(api.auditLog.list, { eventId: ev.id });
  const syncLog = auditLogs.find((a) => a.action === "stripe_redemptions_synced");
  expect(syncLog?.details).toContain("1 failed");
  expect(syncLog?.details).not.toContain("live mode");
});
