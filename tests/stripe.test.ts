import { createHash } from "node:crypto";
import Stripe from "stripe";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { RETRY_WINDOW_MS } from "../convex/stripeBatchModel";
import { blockKey, blockValue } from "../convex/blockValues";

const stripe = vi.hoisted(() => ({ coupon: vi.fn(), promotion: vi.fn() }));
vi.mock("stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("stripe")>();
  class FakeStripe {
    static errors = actual.default.errors;
    coupons = { create: stripe.coupon };
    promotionCodes = { create: stripe.promotion };
  }
  return { default: FakeStripe };
});

const modules = import.meta.glob("../convex/**/*.ts");
const identity = {
  subject: "admin-user",
  email: "admin@example.com",
  emailVerified: true,
};
const input = {
  name: "Conference credits",
  codePrefix: "demo",
  amountCents: 5000,
  quantity: 7,
  expectedLive: false,
  confirmLive: false,
  requestId: "request-1234567890",
};

async function setup() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("admins", { email: identity.email });
  });
  return { t, admin: t.withIdentity(identity) };
}

async function drain(t: Awaited<ReturnType<typeof setup>>["t"]) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("STRIPE_API_KEY", "sk_test_mock_not_a_real_key");
  stripe.coupon
    .mockReset()
    .mockImplementation(async (params) => ({ id: params.id }));
  stripe.promotion.mockReset().mockImplementation(async (params) => ({
    id: `promo_${params.code}`,
    code: params.code,
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Stripe authorization", () => {
  test("every public Stripe endpoint denies anonymous, attendee, event-only, and unverified users", async () => {
    const { t, admin } = await setup();
    const eventId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("events", {
        name: "Event",
        slug: "event",
      });
      await ctx.db.insert("eventAdmins", {
        eventId: id,
        email: "event@example.com",
      });
      return id;
    });
    const batchId = await admin.mutation(api.stripeBatches.create, input);
    const callers = [
      t,
      t.withIdentity({
        subject: "attendee",
        email: "attendee@example.com",
        emailVerified: true,
      }),
      t.withIdentity({
        subject: "event-admin",
        email: "event@example.com",
        emailVerified: true,
      }),
      t.withIdentity({ ...identity, emailVerified: false }),
      t.withIdentity({ ...identity, emailVerified: undefined }),
    ];
    for (const caller of callers) {
      await expect(
        caller.query(api.stripeBatches.configuration),
      ).rejects.toThrow();
      await expect(caller.query(api.stripeBatches.list, {})).rejects.toThrow();
      await expect(
        caller.query(api.stripeBatches.history, {
          paginationOpts: { numItems: 25, cursor: null },
        }),
      ).rejects.toThrow();
      await expect(
        caller.mutation(api.events.create, {
          name: "Unauthorized",
          stripeGeneration: input,
        }),
      ).rejects.toThrow();
      await expect(
        caller.query(api.stripeBatches.get, { batchId }),
      ).rejects.toThrow();
      await expect(
        caller.mutation(api.stripeBatches.create, input),
      ).rejects.toThrow();
      await expect(
        caller.mutation(api.stripeBatches.retry, {
          batchId,
          confirmLive: true,
        }),
      ).rejects.toThrow();
      await expect(
        caller.mutation(api.stripeBatches.attach, { batchId, eventId }),
      ).rejects.toThrow();
    }
    expect(stripe.coupon).not.toHaveBeenCalled();
    expect(stripe.promotion).not.toHaveBeenCalled();
  });

  test("empty allowlist denies Stripe access and queued work stops after revocation", async () => {
    const { t, admin } = await setup();
    const batchId = await admin.mutation(api.stripeBatches.create, input);
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("admins").collect())
        await ctx.db.delete(row._id);
    });
    await expect(
      admin.mutation(api.stripeBatches.create, input),
    ).rejects.toThrow();
    await drain(t);
    expect(stripe.coupon).not.toHaveBeenCalled();
    const batch = await t.run((ctx) => ctx.db.get(batchId));
    expect(batch?.status).toBe("failed");
  });

  test("revocation between Stripe operations stops subsequent calls", async () => {
    const { t, admin } = await setup();
    const batchId = await admin.mutation(api.stripeBatches.create, input);
    stripe.promotion.mockImplementationOnce(async (params) => {
      await t.run(async (ctx) => {
        const row = await ctx.db.query("admins").first();
        await ctx.db.delete(row!._id);
      });
      return { id: "promo_first", code: params.code };
    });
    await drain(t);
    expect(stripe.promotion).toHaveBeenCalledTimes(1);
    expect(await t.run((ctx) => ctx.db.get(batchId))).toMatchObject({
      status: "failed",
      codes: [{ id: "promo_first" }],
    });
  });
});

describe("Stripe generation", () => {
  test.each([undefined, 1, 2])("caps each code at %j redemptions with enough coupon capacity", async (redemptionsPerCode) => {
    const { t, admin } = await setup();
    const batchId = await admin.mutation(api.stripeBatches.create, { ...input, redemptionsPerCode });
    await drain(t);
    const expected = redemptionsPerCode ?? 1;
    expect(stripe.coupon).toHaveBeenCalledWith(
      expect.objectContaining({ max_redemptions: input.quantity * expected, duration: "once" }),
      expect.anything(),
    );
    expect(stripe.promotion).toHaveBeenCalledTimes(input.quantity);
    for (const [params] of stripe.promotion.mock.calls) expect(params.max_redemptions).toBe(expected);
    expect(await admin.query(api.stripeBatches.get, { batchId })).toMatchObject({ redemptionsPerCode: expected, status: "complete" });
    expect((await admin.query(api.stripeBatches.history, { paginationOpts: { cursor: null, numItems: 25 } })).page[0].redemptionsPerCode).toBe(expected);
  });

  test("deduplicates omitted and explicit single use, but rejects a changed redemption limit", async () => {
    const { admin } = await setup();
    const batchId = await admin.mutation(api.stripeBatches.create, input);
    expect(await admin.mutation(api.stripeBatches.create, { ...input, redemptionsPerCode: 1 })).toBe(batchId);
    await expect(admin.mutation(api.stripeBatches.create, { ...input, redemptionsPerCode: 2 })).rejects.toThrow("already used");
  });

  test.each([undefined, 2])("retry preserves the redemption limit, including legacy batches (%j)", async (redemptionsPerCode) => {
    const { t, admin } = await setup();
    const batchId = await admin.mutation(api.stripeBatches.create, { ...input, redemptionsPerCode });
    if (redemptionsPerCode === undefined) {
      await t.run((ctx) => ctx.db.patch(batchId, {
        redemptionsPerCode: undefined,
        requestFingerprint: JSON.stringify({ name: input.name, prefix: "DEMO", amountCents: input.amountCents, quantity: input.quantity, live: false }),
      }));
      expect(await admin.mutation(api.stripeBatches.create, { ...input, redemptionsPerCode: 1 })).toBe(batchId);
    }
    stripe.promotion
      .mockImplementationOnce(async (params) => ({ id: "promo_first", code: params.code }))
      .mockRejectedValueOnce(new Error("temporary failure"));
    await drain(t);
    const failedCall = stripe.promotion.mock.calls[1];
    expect(failedCall[0].max_redemptions).toBe(redemptionsPerCode ?? 1);
    await admin.mutation(api.stripeBatches.retry, { batchId, confirmLive: false });
    await drain(t);
    expect(stripe.promotion.mock.calls[2]).toEqual(failedCall);
    expect(stripe.coupon).toHaveBeenCalledTimes(1);
    expect(await admin.query(api.stripeBatches.get, { batchId })).toMatchObject({ redemptionsPerCode: redemptionsPerCode ?? 1, status: "complete" });
  });

  test.each([0, 3, -1, 1.5, NaN, Infinity])("rejects invalid redemption limit %j in both creation paths", async (redemptionsPerCode) => {
    const { t, admin } = await setup();
    const request = { ...input, redemptionsPerCode };
    await expect(admin.mutation(api.stripeBatches.create, request)).rejects.toThrow();
    await expect(admin.mutation(api.events.create, { name: "Invalid", stripeGeneration: request })).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.query("stripeBatches").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("events").collect())).toHaveLength(0);
    expect(stripe.coupon).not.toHaveBeenCalled();
  });

  test("event generation preserves two redemptions while dispensing each code only once", async () => {
    const { t, admin } = await setup();
    const event = await admin.mutation(api.events.create, { name: "Two uses", dynamic: true, stripeGeneration: { ...input, quantity: 1, redemptionsPerCode: 2 } });
    await drain(t);
    expect((await admin.query(api.stripeBatches.list, { eventId: event.id }))[0].redemptionsPerCode).toBe(2);
    const attendee = t.withIdentity({ subject: "attendee", email: "attendee@example.com", emailVerified: true });
    expect(await attendee.mutation(api.claims.claim, { slug: event.slug })).toMatchObject({ ok: true, alreadyClaimed: false });
    expect(await attendee.mutation(api.claims.claim, { slug: event.slug })).toMatchObject({ ok: true, alreadyClaimed: true });
    expect(await t.run((ctx) => ctx.db.query("codes").collect())).toHaveLength(1);
  });

  test.each([undefined, "", "   "])("generates and persists one four-letter prefix when the supplied prefix is %j", async (codePrefix) => {
    const { t, admin } = await setup();
    const request = { ...input, codePrefix };
    const batchId = await admin.mutation(api.stripeBatches.create, request);
    const batch = await admin.query(api.stripeBatches.get, { batchId });
    expect(batch?.prefix).toMatch(/^[A-Z]{4}$/);
    expect(await admin.mutation(api.stripeBatches.create, request)).toBe(batchId);
    expect(await admin.mutation(api.stripeBatches.create, { ...request, codePrefix: "" })).toBe(batchId);
    await expect(
      admin.mutation(api.stripeBatches.create, { ...request, codePrefix: "EDIT" }),
    ).rejects.toThrow("already used");
    await drain(t);
    const complete = await admin.query(api.stripeBatches.get, { batchId });
    expect(complete).toMatchObject({ prefix: batch!.prefix, status: "complete", generatedCount: input.quantity });
    expect(complete?.codes.every((code) => code.code.startsWith(`${batch!.prefix}-`))).toBe(true);
    expect(stripe.promotion).toHaveBeenCalledTimes(input.quantity);
    expect(await t.run((ctx) => ctx.db.query("stripeBatches").collect())).toHaveLength(1);
  });

  test.each(["", "SUMMERSALE12"])("retry preserves a legacy prefix of %j", async (prefix) => {
    const { t, admin } = await setup();
    const batchId = await admin.mutation(api.stripeBatches.create, { ...input, quantity: 1 });
    await t.run((ctx) => ctx.db.patch(batchId, { prefix }));
    stripe.promotion.mockRejectedValueOnce(new Error("temporary failure"));
    await drain(t);
    const failedCall = stripe.promotion.mock.calls[0];
    expect(failedCall[0].code).toMatch(
      prefix ? /^SUMMERSALE12-[A-Z0-9]{10}$/ : /^[A-Z0-9]{10}$/,
    );
    await admin.mutation(api.stripeBatches.retry, { batchId, confirmLive: false });
    await drain(t);
    expect(stripe.promotion.mock.calls[1]).toEqual(failedCall);
    expect(await admin.query(api.stripeBatches.get, { batchId })).toMatchObject({ prefix, status: "complete" });
  });

  test.each([39, 40, 41, 80, 81, 120])(
    "normalizes a %i-character name before saving the batch and calling Stripe",
    async (length) => {
      const { t, admin } = await setup();
      const request = { ...input, name: "N".repeat(length), quantity: 1 };
      const expectedName = request.name.slice(0, 40);
      const batchId = await admin.mutation(api.stripeBatches.create, request);
      expect(await admin.mutation(api.stripeBatches.create, request)).toBe(
        batchId,
      );
      expect(
        await admin.query(api.stripeBatches.get, { batchId }),
      ).toMatchObject({ name: expectedName });
      await drain(t);
      expect(stripe.coupon).toHaveBeenCalledWith(
        expect.objectContaining({ name: expectedName }),
        { idempotencyKey: `vm:${batchId}:coupon` },
      );
      expect(
        await admin.query(api.stripeBatches.get, { batchId }),
      ).toMatchObject({ status: "complete" });
    },
  );

  test("shortens legacy batch names at the Stripe boundary and uses a stable replacement idempotency key", async () => {
    const { t, admin } = await setup();
    const batchId = await admin.mutation(api.stripeBatches.create, {
      ...input,
      quantity: 1,
    });
    const legacyName = "L".repeat(60);
    await t.run(async (ctx) => {
      await ctx.db.patch(batchId, { name: legacyName, status: "failed" });
    });
    stripe.coupon.mockRejectedValueOnce(new Error("temporary failure"));
    await admin.mutation(api.stripeBatches.retry, {
      batchId,
      confirmLive: false,
    });
    await drain(t);
    await admin.mutation(api.stripeBatches.retry, {
      batchId,
      confirmLive: false,
    });
    await drain(t);
    const [first, second] = stripe.coupon.mock.calls;
    expect(first[0]).toMatchObject({
      id: `vm_${batchId}`,
      name: "L".repeat(40),
    });
    expect(first[1].idempotencyKey).not.toBe(`vm:${batchId}:coupon`);
    expect(second).toEqual(first);
    expect(await admin.query(api.stripeBatches.get, { batchId })).toMatchObject(
      { status: "complete", name: legacyName },
    );
  });

  test("legacy batches with a saved coupon reuse it without creating another coupon", async () => {
    const { t, admin } = await setup();
    const batchId = await admin.mutation(api.stripeBatches.create, {
      ...input,
      quantity: 1,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(batchId, {
        name: "L".repeat(60),
        status: "failed",
        couponId: "coupon_existing",
      });
    });
    await admin.mutation(api.stripeBatches.retry, {
      batchId,
      confirmLive: false,
    });
    await drain(t);
    expect(stripe.coupon).not.toHaveBeenCalled();
    expect(stripe.promotion).toHaveBeenCalledWith(
      expect.objectContaining({ coupon: "coupon_existing" }),
      expect.anything(),
    );
    expect(await admin.query(api.stripeBatches.get, { batchId })).toMatchObject(
      { status: "complete" },
    );
  });
  test("limits concurrent batches and creation bursts", async () => {
    const { t, admin } = await setup();
    for (let index = 0; index < 3; index++) {
      await admin.mutation(api.stripeBatches.create, {
        ...input,
        requestId: `request-concurrent-${index}`,
      });
    }
    await expect(
      admin.mutation(api.stripeBatches.create, {
        ...input,
        requestId: "request-concurrent-4",
      }),
    ).rejects.toThrow("already in progress");
    await t.run(async (ctx) => {
      for (const batch of await ctx.db.query("stripeBatches").collect())
        await ctx.db.patch(batch._id, { status: "failed" });
    });
    for (let index = 3; index < 5; index++) {
      await admin.mutation(api.stripeBatches.create, {
        ...input,
        requestId: `request-concurrent-${index}`,
      });
    }
    await expect(
      admin.mutation(api.stripeBatches.create, {
        ...input,
        requestId: "request-concurrent-5",
      }),
    ).rejects.toThrow("Wait a minute");
  });

  test("retry cannot bypass the concurrent batch limit", async () => {
    const { t, admin } = await setup();
    stripe.coupon.mockRejectedValueOnce(new Error("temporary failure"));
    const batchId = await admin.mutation(api.stripeBatches.create, input);
    await drain(t);
    for (let index = 0; index < 3; index++) {
      await admin.mutation(api.stripeBatches.create, {
        ...input,
        requestId: `queued-request-${index}`,
      });
    }
    await expect(
      admin.mutation(api.stripeBatches.retry, { batchId, confirmLive: false }),
    ).rejects.toThrow("already in progress");
  });

  test("retries collisions with a distinct code and idempotency key", async () => {
    const { t, admin } = await setup();
    stripe.promotion.mockRejectedValueOnce(
      new Stripe.errors.StripeInvalidRequestError({
        type: "invalid_request_error",
        message: "Code already exists",
        code: "resource_already_exists",
      }),
    );
    const batchId = await admin.mutation(api.stripeBatches.create, {
      ...input,
      quantity: 1,
    });
    await drain(t);
    expect(stripe.promotion).toHaveBeenCalledTimes(2);
    expect(stripe.promotion.mock.calls[0][0].code).not.toBe(
      stripe.promotion.mock.calls[1][0].code,
    );
    expect(stripe.promotion.mock.calls[0][1].idempotencyKey).not.toBe(
      stripe.promotion.mock.calls[1][1].idempotencyKey,
    );
    expect(await admin.query(api.stripeBatches.get, { batchId })).toMatchObject(
      { status: "complete", generatedCount: 1 },
    );
  });

  test("interrupted workers become retryable and stale workers cannot overwrite the batch", async () => {
    const { t, admin } = await setup();
    const batchId = await admin.mutation(api.stripeBatches.create, {
      ...input,
      quantity: 1,
    });
    await t.mutation(internal.stripeBatches.begin, {
      batchId,
      version: 0,
      seed: "test-seed",
      keyFingerprint: createHash("sha256")
        .update(process.env.STRIPE_API_KEY!)
        .digest("hex"),
    });
    await drain(t);
    expect(await admin.query(api.stripeBatches.get, { batchId })).toMatchObject(
      { status: "failed" },
    );
    expect(stripe.coupon).not.toHaveBeenCalled();
    await admin.mutation(api.stripeBatches.retry, {
      batchId,
      confirmLive: false,
    });
    await drain(t);
    await t.mutation(internal.stripeBatches.fail, {
      batchId,
      version: 0,
      error: "Stale failure",
    });
    expect(await admin.query(api.stripeBatches.get, { batchId })).toMatchObject(
      { status: "complete", generatedCount: 1 },
    );
  });
  test("creates capped single-use USD codes, saves progress and hides internal secrets", async () => {
    const { t, admin } = await setup();
    const expiresAt = Date.now() + 3_600_000;
    const batchId = await admin.mutation(api.stripeBatches.create, {
      ...input,
      expiresAt,
    });
    await drain(t);
    expect(stripe.coupon).toHaveBeenCalledTimes(1);
    expect(stripe.coupon).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_off: 5000,
        currency: "usd",
        duration: "once",
        max_redemptions: 7,
        redeem_by: Math.floor(expiresAt / 1000),
      }),
      expect.objectContaining({ idempotencyKey: `vm:${batchId}:coupon` }),
    );
    expect(stripe.promotion).toHaveBeenCalledTimes(7);
    for (const [params, options] of stripe.promotion.mock.calls) {
      expect(params).toMatchObject({
        max_redemptions: 1,
        coupon: `vm_${batchId}`,
        expires_at: Math.floor(expiresAt / 1000),
      });
      expect(params.code).toMatch(
        /^DEMO-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/,
      );
      expect(options.idempotencyKey).toContain(`vm:${batchId}:promo:`);
    }
    const batch = await admin.query(api.stripeBatches.get, { batchId });
    expect(batch).toMatchObject({ status: "complete", generatedCount: 7 });
    expect(batch).not.toHaveProperty("seed");
    expect(batch).not.toHaveProperty("keyFingerprint");
    expect(JSON.stringify(batch)).not.toContain("sk_test_");
  });

  test("repeated create requests and duplicate worker delivery do not create extra batches", async () => {
    const { t, admin } = await setup();
    const batchId = await admin.mutation(api.stripeBatches.create, input);
    expect(await admin.mutation(api.stripeBatches.create, input)).toBe(batchId);
    await expect(
      admin.mutation(api.stripeBatches.create, { ...input, quantity: 8 }),
    ).rejects.toThrow("already used");
    await drain(t);
    await t.action(internal.stripeWorker.generate, { batchId, version: 0 });
    expect(stripe.coupon).toHaveBeenCalledTimes(1);
    expect(stripe.promotion).toHaveBeenCalledTimes(7);
  });

  test("partial failure keeps codes and retry reuses the same Stripe idempotency key", async () => {
    const { t, admin } = await setup();
    stripe.promotion
      .mockImplementationOnce(async (params) => ({
        id: "promo_first",
        code: params.code,
      }))
      .mockRejectedValueOnce(
        new Error("sensitive Stripe error sk_test_do_not_expose"),
      );
    const batchId = await admin.mutation(api.stripeBatches.create, { ...input, codePrefix: "" });
    await drain(t);
    const failed = await admin.query(api.stripeBatches.get, { batchId });
    expect(failed).toMatchObject({ status: "failed", generatedCount: 1 });
    expect(failed?.prefix).toMatch(/^[A-Z]{4}$/);
    expect(failed?.error).not.toContain("sk_test_");
    const failedKey = stripe.promotion.mock.calls[1][1].idempotencyKey;
    await admin.mutation(api.stripeBatches.retry, {
      batchId,
      confirmLive: false,
    });
    await drain(t);
    expect(stripe.promotion.mock.calls[2][1].idempotencyKey).toBe(failedKey);
    expect(stripe.promotion.mock.calls[2]).toEqual(stripe.promotion.mock.calls[1]);
    expect(stripe.coupon).toHaveBeenCalledTimes(1);
    expect(await admin.query(api.stripeBatches.get, { batchId })).toMatchObject(
      { status: "complete", generatedCount: 7, prefix: failed!.prefix },
    );
  });

  test("rejects unsafe retries and changed Stripe accounts", async () => {
    const { t, admin } = await setup();
    stripe.promotion.mockRejectedValue(new Error("failure"));
    const batchId = await admin.mutation(api.stripeBatches.create, input);
    await drain(t);
    vi.stubEnv("STRIPE_API_KEY", "sk_test_different_account_key");
    await admin.mutation(api.stripeBatches.retry, {
      batchId,
      confirmLive: false,
    });
    await drain(t);
    expect(stripe.coupon).toHaveBeenCalledTimes(1);
    expect(stripe.promotion).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(RETRY_WINDOW_MS);
    await expect(
      admin.mutation(api.stripeBatches.retry, { batchId, confirmLive: false }),
    ).rejects.toThrow("safe retry window");
  });

  test("requires server-validated live confirmation and matching mode", async () => {
    const { admin } = await setup();
    vi.stubEnv("STRIPE_API_KEY", "sk_live_mock_not_a_real_key");
    await expect(
      admin.mutation(api.stripeBatches.create, input),
    ).rejects.toThrow("mode changed");
    await expect(
      admin.mutation(api.stripeBatches.create, {
        ...input,
        expectedLive: true,
      }),
    ).rejects.toThrow("Confirm live");
    await expect(
      admin.mutation(api.stripeBatches.create, {
        ...input,
        expectedLive: true,
        confirmLive: true,
      }),
    ).resolves.toBeTruthy();
    expect(stripe.coupon).not.toHaveBeenCalled();
  });

  test.each([
    { quantity: 0 },
    { quantity: 501 },
    { quantity: 1.5 },
    { amountCents: 0 },
    { amountCents: 1.1 },
    { amountCents: NaN },
    { amountCents: Infinity },
    { amountCents: 100_000_000 },
    { name: " " },
    { codePrefix: "!!!" },
    { codePrefix: "ABCDE" },
    { codePrefix: "A1" },
    { codePrefix: "1234" },
    { codePrefix: "A B" },
    { codePrefix: "A-B" },
    { codePrefix: "é" },
    { codePrefix: "ß" },
    { expiresAt: 0 },
    { requestId: "short" },
  ])("rejects invalid input %j before scheduling Stripe", async (invalid) => {
    const { t, admin } = await setup();
    await expect(
      admin.mutation(api.stripeBatches.create, { ...input, ...invalid }),
    ).rejects.toThrow();
    expect(
      await t.run((ctx) => ctx.db.query("stripeBatches").collect()),
    ).toHaveLength(0);
    expect(stripe.coupon).not.toHaveBeenCalled();
  });

  test("missing configuration fails closed", async () => {
    const { admin } = await setup();
    vi.stubEnv("STRIPE_API_KEY", "");
    expect(await admin.query(api.stripeBatches.configuration)).toEqual({
      configured: false,
      live: false,
    });
    await expect(
      admin.mutation(api.stripeBatches.create, input),
    ).rejects.toThrow("not configured");
  });
});

describe("code library", () => {
  test("saves a standalone block and all its codes without creating an event", async () => {
    const { t, admin } = await setup();
    const batchId = await admin.mutation(api.stripeBatches.create, {
      ...input,
      quantity: 2,
    });
    await drain(t);
    const block = await admin.query(api.stripeBatches.get, { batchId });
    expect(block).toMatchObject({
      status: "complete",
      generatedCount: 2,
      eventName: null,
    });
    expect(block?.codes).toHaveLength(2);
    expect(block?.eventId).toBeUndefined();
    expect(block?.targetEventId).toBeUndefined();
    expect(await t.run((ctx) => ctx.db.query("events").collect())).toHaveLength(
      0,
    );
    expect(await t.run((ctx) => ctx.db.query("codes").collect())).toHaveLength(
      0,
    );
    vi.stubEnv("STRIPE_API_KEY", "");
    const history = await admin.query(api.stripeBatches.history, {
      filter: "available",
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(history.page).toMatchObject([{ _id: batchId, generatedCount: 2 }]);
    expect(history.page[0]).not.toHaveProperty("codes");
    expect(history.page[0]).not.toHaveProperty("seed");
  });

  test("filters the full saved library, preserves pagination, and resolves event names", async () => {
    const { t, admin } = await setup();
    const event = await admin.mutation(api.events.create, {
      name: "Assigned event",
    });
    const ids = await t.run(async (ctx) => {
      const base = {
        name: "Block",
        prefix: "",
        amountCents: 5000,
        quantity: 1,
        live: false,
        createdBy: identity.email,
        requestId: "library-test-request",
        requestFingerprint: "{}",
        status: "complete" as const,
        version: 1,
        codes: [{ id: "promo_example", code: "EXAMPLE" }],
      };
      const available = await ctx.db.insert("stripeBatches", {
        ...base,
        name: "Available",
      });
      const assigned = await ctx.db.insert("stripeBatches", {
        ...base,
        name: "Assigned",
        eventId: event.id,
      });
      await ctx.db.insert("stripeBatches", {
        ...base,
        name: "Expired",
        expiresAt: Date.now() - 1000,
      });
      const failed = await ctx.db.insert("stripeBatches", {
        ...base,
        name: "Failed",
        status: "failed",
        codes: [],
        error: "Generation stopped",
      });
      await ctx.db.insert("stripeBatches", {
        ...base,
        name: "Generating",
        status: "queued",
        codes: [],
      });
      const needsAssignment = await ctx.db.insert("stripeBatches", {
        ...base,
        name: "Needs assignment",
        error: "Target changed",
      });
      await ctx.db.insert("eventAdmins", {
        eventId: event.id,
        email: "event-admin@example.com",
      });
      return { available, assigned, failed, needsAssignment };
    });
    const paginationOpts = { numItems: 25, cursor: null };
    expect(
      (await admin.query(api.stripeBatches.history, { paginationOpts })).page,
    ).toHaveLength(6);
    const assigned = await admin.query(api.stripeBatches.history, {
      filter: "assigned",
      paginationOpts,
    });
    expect(assigned.page).toMatchObject([
      { _id: ids.assigned, eventName: "Assigned event" },
    ]);
    const attention = await admin.query(api.stripeBatches.history, {
      filter: "attention",
      paginationOpts,
    });
    expect(new Set(attention.page.map((block) => block._id))).toEqual(
      new Set([ids.failed, ids.needsAssignment]),
    );
    const first = await admin.query(api.stripeBatches.history, {
      filter: "available",
      paginationOpts: { numItems: 1, cursor: null },
    });
    const second = await admin.query(api.stripeBatches.history, {
      filter: "available",
      paginationOpts: { numItems: 1, cursor: first.continueCursor },
    });
    expect(
      new Set([...first.page, ...second.page].map((block) => block._id)),
    ).toEqual(new Set([ids.available, ids.needsAssignment]));
    const eventAdmin = t.withIdentity({
      subject: "event-admin",
      email: "event-admin@example.com",
      emailVerified: true,
    });
    await expect(
      eventAdmin.query(api.stripeBatches.history, {
        filter: "assigned",
        paginationOpts,
      }),
    ).rejects.toThrow("Not an admin");
    await admin.mutation(api.events.remove, { id: event.id });
    expect(
      (
        await admin.query(api.stripeBatches.history, {
          filter: "assigned",
          paginationOpts,
        })
      ).page,
    ).toMatchObject([{ _id: ids.assigned, eventName: null }]);
    expect(
      await admin.query(api.stripeBatches.get, { batchId: ids.assigned }),
    ).toMatchObject({ eventName: null });
  });
});

describe("batch assignment", () => {
  test.each([
    { name: "Itaú Hackathon", codeType: undefined },
    { name: "Workshop", codeType: "Créditos" },
  ])("finishes and assigns Unicode block names: $name / $codeType", async ({ name, codeType }) => {
    const { t, admin } = await setup();
    const event = await admin.mutation(api.events.create, { name: "Unicode event" });
    const batchId = await admin.mutation(api.stripeBatches.create, {
      ...input, name, codeType, eventId: event.id, quantity: 2,
    });
    await drain(t);
    expect(await admin.query(api.stripeBatches.get, { batchId })).toMatchObject({
      name, status: "complete", eventId: event.id, generatedCount: 2,
    });
    const type = codeType ?? name;
    const updatedEvent = await admin.query(api.events.get, { id: event.id });
    expect(updatedEvent).toMatchObject({ codeTypes: [type] });
    expect(updatedEvent?.codeTypeValues?.[blockKey(type)]).toBe("50");
    const attendee = { subject: "attendee", email: "attendee@example.com", emailVerified: true };
    await t.run((ctx) => ctx.db.insert("emails", { eventId: event.id, email: attendee.email }));
    const user = t.withIdentity(attendee);
    expect(await user.mutation(api.claims.claim, { slug: event.slug, codeType: type })).toMatchObject({
      ok: true, codeType: type, creditAmount: "50",
    });
    expect(await user.query(api.codes.mine)).toMatchObject([{ event: { creditAmount: "50" } }]);
  });

  test("manual Unicode blocks keep their values through renaming and cleanup", async () => {
    const { admin } = await setup();
    const event = await admin.mutation(api.events.create, { name: "Manual blocks" });
    await admin.mutation(api.codes.add, {
      eventId: event.id, codes: ["MANUAL-CODE"], codeType: "Itaú Hackathon", value: "50",
    });
    await admin.mutation(api.codes.renameType, {
      eventId: event.id, from: "Itaú Hackathon", to: "Créditos",
    });
    let updated = (await admin.query(api.events.get, { id: event.id }))!;
    expect(blockValue(updated, "Créditos")).toBe("50");
    expect(updated.codeTypeValues).not.toHaveProperty(blockKey("Itaú Hackathon"));
    await admin.mutation(api.codes.setTypeValue, {
      eventId: event.id, codeType: "Créditos", value: "75",
    });
    updated = (await admin.query(api.events.get, { id: event.id }))!;
    expect(blockValue(updated, "Créditos")).toBe("75");
    const [code] = await admin.query(api.codes.list, { eventId: event.id });
    await admin.mutation(api.codes.remove, { id: code._id });
    updated = (await admin.query(api.events.get, { id: event.id }))!;
    expect(updated.codeTypes).toEqual([]);
    expect(updated.codeTypeValues).toEqual({});
    expect(stripe.promotion).not.toHaveBeenCalled();
  });

  test("resumes an 80-of-80 saved Unicode batch without creating any new Stripe codes", async () => {
    const { t, admin } = await setup();
    const name = "Itaú Hackathon";
    const event = await admin.mutation(api.events.create, { name });
    const batchId = await admin.mutation(api.stripeBatches.create, {
      ...input, name, quantity: 80, eventId: event.id,
    });
    const savedCodes = Array.from({ length: 80 }, (_, index) => ({
      id: `promo_saved_${index}`, code: `SAVED-${index}`,
    }));
    await t.run((ctx) => ctx.db.patch(batchId, {
      status: "failed", codes: savedCodes, couponId: "coupon_saved",
      seed: "saved-seed", startedAt: Date.now(), error: "Generation stopped",
    }));
    await admin.mutation(api.stripeBatches.retry, { batchId, confirmLive: false });
    await drain(t);
    const batch = await admin.query(api.stripeBatches.get, { batchId });
    expect(batch).toMatchObject({ status: "complete", eventId: event.id, generatedCount: 80 });
    expect(batch?.codes).toEqual(savedCodes);
    expect(batch?.error).toBeUndefined();
    expect(stripe.coupon).not.toHaveBeenCalled();
    expect(stripe.promotion).not.toHaveBeenCalled();
    await admin.mutation(api.stripeBatches.attach, { batchId, eventId: event.id });
    expect(await admin.query(api.codes.list, { eventId: event.id })).toHaveLength(80);
    expect(blockValue((await admin.query(api.events.get, { id: event.id }))!, name)).toBe("50");
  });

  test("fully saved batches report a finalization failure rather than a Stripe generation failure", async () => {
    const { t, admin } = await setup();
    const batchId = await admin.mutation(api.stripeBatches.create, { ...input, quantity: 1 });
    await t.run((ctx) => ctx.db.patch(batchId, {
      status: "running", couponId: "coupon_saved", codes: [{ id: "promo_saved", code: "SAVED" }],
    }));
    await t.mutation(internal.stripeBatches.fail, {
      batchId, version: 0, error: "Generation stopped. Check Stripe permissions.",
    });
    const batch = await admin.query(api.stripeBatches.get, { batchId });
    expect(batch?.status).toBe("failed");
    expect(batch?.error).toContain("All codes are saved");
    expect(batch?.error).not.toContain("Stripe permissions");
    await drain(t);
    expect(stripe.promotion).not.toHaveBeenCalled();
  });

  test.each([undefined, "camp"])("new events use the custom or automatic prefix %j for their entire batch", async (codePrefix) => {
    const { t, admin } = await setup();
    const event = await admin.mutation(api.events.create, {
      name: "Prefixed event",
      stripeGeneration: { ...input, codePrefix, quantity: 2 },
    });
    const [batch] = await admin.query(api.stripeBatches.list, { eventId: event.id });
    if (codePrefix) expect(batch.prefix).toBe("CAMP");
    else expect(batch.prefix).toMatch(/^[A-Z]{4}$/);
    await drain(t);
    const codes = await admin.query(api.codes.list, { eventId: event.id });
    expect(codes).toHaveLength(2);
    expect(codes.every((code) => code.code.startsWith(`${batch.prefix}-`))).toBe(true);
  });

  test("shortens a batch name derived from a long event name without renaming the event", async () => {
    const { t, admin } = await setup();
    const name = "Community coding workshop ".repeat(4).trim();
    const event = await admin.mutation(api.events.create, {
      name,
      stripeGeneration: { ...input, name, quantity: 1 },
    });
    await drain(t);
    expect(await admin.query(api.events.get, { id: event.id })).toMatchObject({
      name,
    });
    expect(
      await admin.query(api.stripeBatches.list, { eventId: event.id }),
    ).toMatchObject([
      {
        name: name.slice(0, 40).trimEnd(),
        status: "complete",
        eventId: event.id,
      },
    ]);
  });
  test("creates an event and its generation job atomically, then attaches its codes", async () => {
    const { t, admin } = await setup();
    const event = await admin.mutation(api.events.create, {
      name: "New event",
      stripeGeneration: input,
    });
    const batches = await admin.query(api.stripeBatches.list, {
      eventId: event.id,
    });
    expect(batches).toHaveLength(1);
    expect(
      await admin.query(api.codes.list, { eventId: event.id }),
    ).toHaveLength(0);
    await drain(t);
    expect(
      await admin.query(api.codes.list, { eventId: event.id }),
    ).toHaveLength(input.quantity);
    expect(
      await admin.query(api.stripeBatches.get, { batchId: batches[0]._id }),
    ).toMatchObject({ status: "complete", eventId: event.id });
    expect(
      await admin.mutation(api.stripeBatches.create, {
        ...input,
        eventId: event.id,
      }),
    ).toBe(batches[0]._id);
    expect(
      await admin.query(api.auditLog.list, { eventId: event.id }),
    ).toMatchObject([
      { action: "stripe_batch_attached", actorEmail: identity.email },
    ]);
  });

  test.each([{ quantity: 501 }, { codePrefix: "ABCDE" }, { codePrefix: "A1" }])("invalid generation %j rolls back the event and does not schedule Stripe", async (invalid) => {
    const { t, admin } = await setup();
    await expect(
      admin.mutation(api.events.create, {
        name: "Invalid event",
        stripeGeneration: { ...input, ...invalid },
      }),
    ).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.query("events").collect())).toHaveLength(
      0,
    );
    expect(
      await t.run((ctx) => ctx.db.query("stripeBatches").collect()),
    ).toHaveLength(0);
    await drain(t);
    expect(stripe.coupon).not.toHaveBeenCalled();
  });

  test("saved-batch event creation is atomic and rejects reusing an assigned batch", async () => {
    const { t, admin } = await setup();
    const batchId = await admin.mutation(api.stripeBatches.create, input);
    await drain(t);
    const event = await admin.mutation(api.events.create, {
      name: "Saved batch event",
      stripeBatchId: batchId,
    });
    expect(
      await admin.query(api.codes.list, { eventId: event.id }),
    ).toHaveLength(7);
    await expect(
      admin.mutation(api.events.create, {
        name: "Duplicate",
        stripeBatchId: batchId,
      }),
    ).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.query("events").collect())).toHaveLength(
      1,
    );
    expect(await admin.mutation(api.stripeBatches.create, input)).toBe(batchId);
  });

  test("checks destination block constraints before creating anything in Stripe", async () => {
    const { t, admin } = await setup();
    const event = await admin.mutation(api.events.create, {
      name: "Two blocks",
    });
    await admin.mutation(api.codes.add, {
      eventId: event.id,
      codes: ["EXISTING-1"],
      codeType: "First",
      value: "50",
    });
    await admin.mutation(api.codes.add, {
      eventId: event.id,
      codes: ["EXISTING-2"],
      codeType: "Second",
      value: "25",
    });
    await expect(
      admin.mutation(api.stripeBatches.create, { ...input, eventId: event.id }),
    ).rejects.toThrow("two blocks");
    await expect(
      admin.mutation(api.stripeBatches.create, {
        ...input,
        eventId: event.id,
        codeType: "Second",
      }),
    ).rejects.toThrow("different value");
    await admin.mutation(api.stripeBatches.create, {
      ...input,
      eventId: event.id,
      codeType: "First",
    });
    await drain(t);
    expect(await admin.query(api.events.get, { id: event.id })).toMatchObject({
      codeTypes: ["First", "Second"],
    });
    expect(
      await admin.query(api.codes.list, { eventId: event.id }),
    ).toHaveLength(9);
  });

  test("event changes during generation preserve completed codes without a partial attachment", async () => {
    const { t, admin } = await setup();
    const event = await admin.mutation(api.events.create, {
      name: "Changing event",
    });
    const batchId = await admin.mutation(api.stripeBatches.create, {
      ...input,
      eventId: event.id,
    });
    await admin.mutation(api.codes.add, {
      eventId: event.id,
      codes: ["MANUAL-CODE"],
    });
    await drain(t);
    expect(
      await admin.query(api.codes.list, { eventId: event.id }),
    ).toHaveLength(1);
    const batch = await admin.query(api.stripeBatches.get, { batchId });
    expect(batch).toMatchObject({ status: "complete", generatedCount: 7 });
    expect(batch?.eventId).toBeUndefined();
    expect(batch?.error).toContain("unnamed block");
  });
  test("attaches a completed batch exactly once and preserves single-event assignment", async () => {
    const { t, admin } = await setup();
    const first = await admin.mutation(api.events.create, {
      name: "First event",
    });
    const second = await admin.mutation(api.events.create, {
      name: "Second event",
    });
    const batchId = await admin.mutation(api.stripeBatches.create, input);
    await expect(
      admin.mutation(api.stripeBatches.attach, { batchId, eventId: first.id }),
    ).rejects.toThrow("entire batch");
    await drain(t);
    await admin.mutation(api.stripeBatches.attach, {
      batchId,
      eventId: first.id,
    });
    await admin.mutation(api.stripeBatches.attach, {
      batchId,
      eventId: first.id,
    });
    expect(
      await admin.query(api.codes.list, { eventId: first.id }),
    ).toHaveLength(7);
    expect(await admin.query(api.events.get, { id: first.id })).toMatchObject({
      codeTypes: [input.name],
      codeTypeValues: { [input.name]: "50" },
    });
    await expect(
      admin.mutation(api.stripeBatches.attach, { batchId, eventId: second.id }),
    ).rejects.toThrow("another event");
    const publicEvent = await t.query(api.events.getBySlug, {
      slug: first.slug,
    });
    expect(JSON.stringify(publicEvent)).not.toContain("couponId");
    expect(JSON.stringify(publicEvent)).not.toContain("DEMO-");
  });

  test("automatically adds codes to the target event but keeps history if the event disappears", async () => {
    const { t, admin } = await setup();
    const event = await admin.mutation(api.events.create, { name: "Target" });
    const batchId = await admin.mutation(api.stripeBatches.create, {
      ...input,
      eventId: event.id,
    });
    await admin.mutation(api.events.remove, { id: event.id });
    await drain(t);
    expect(await admin.query(api.stripeBatches.get, { batchId })).toMatchObject(
      { status: "complete", generatedCount: 7 },
    );
    expect(await t.run((ctx) => ctx.db.query("codes").collect())).toHaveLength(
      0,
    );
  });
});
