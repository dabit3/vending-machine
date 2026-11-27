import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { EVENT_DELETE_BATCH_SIZE } from "../convex/events";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
const globalAdmin = { subject: "adm", email: "admin@example.com", emailVerified: true };
const organizer = { subject: "org", email: "org@example.com", emailVerified: true };
const outsider = { subject: "out", email: "out@example.com", emailVerified: true };

async function setupEvent({
  dynamic = false,
  allowedDomains,
}: {
  dynamic?: boolean;
  allowedDomains?: string[];
} = {}) {
  const t = convexTest(schema, modules);
  const eventId = await t.run(async (ctx) => {
    await ctx.db.insert("admins", { email: globalAdmin.email });
    const eventId = await ctx.db.insert("events", {
      name: "Live Drop",
      slug: "live-drop",
      dynamic: dynamic || undefined,
      allowedDomains,
    });
    await ctx.db.insert("eventAdmins", { eventId, email: organizer.email });
    return eventId;
  });
  return {
    t,
    eventId,
    admin: t.withIdentity(globalAdmin),
    org: t.withIdentity(organizer),
    stranger: t.withIdentity(outsider),
  };
}

test("events.remove deletes the event immediately and purges >batch rows across scheduled batches", async () => {
  vi.useFakeTimers();
  try {
    const { t, eventId, admin } = await setupEvent();
    const totalEmails = EVENT_DELETE_BATCH_SIZE + 65;
    await t.run(async (ctx) => {
      for (let i = 0; i < totalEmails; i++) {
        await ctx.db.insert("emails", {
          eventId,
          email: `user${i}@example.com`,
        });
      }
      await ctx.db.insert("codes", { eventId, code: "CODE-1" });
      await ctx.db.insert("flaggedEmails", {
        eventId,
        email: "flag@example.com",
        matchedEventIds: [],
      });
      await ctx.db.insert("accessRequests", {
        eventId,
        email: "req@example.com",
        status: "pending",
      });
    });

    await admin.mutation(api.events.remove, { id: eventId });

    // Event itself is gone immediately, before scheduled follow-up batches run.
    expect(await t.run((ctx) => ctx.db.get(eventId))).toBeNull();

    // Wait for all scheduled purgeDeletedEvent batches to finish.
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const remaining = await t.run(async (ctx) => ({
      emails: (await ctx.db.query("emails").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect()).length,
      codes: (await ctx.db.query("codes").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect()).length,
      flagged: (await ctx.db.query("flaggedEmails").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect()).length,
      requests: (await ctx.db.query("accessRequests").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect()).length,
      admins: (await ctx.db.query("eventAdmins").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect()).length,
    }));
    expect(remaining).toEqual({
      emails: 0,
      codes: 0,
      flagged: 0,
      requests: 0,
      admins: 0,
    });
  } finally {
    vi.useRealTimers();
  }
});

test("waitlist.listRequests paginates, filters by status, attaches flagged state, and enforces auth", async () => {
  const { t, eventId, org, stranger } = await setupEvent();
  await t.run(async (ctx) => {
    await ctx.db.insert("flaggedEmails", {
      eventId,
      email: "b@example.com",
      matchedEventIds: [],
    });
    await ctx.db.insert("accessRequests", {
      eventId,
      email: "a@example.com",
      status: "pending",
    });
    await ctx.db.insert("accessRequests", {
      eventId,
      email: "b@example.com",
      status: "pending",
    });
    await ctx.db.insert("accessRequests", {
      eventId,
      email: "c@example.com",
      status: "approved",
    });
  });

  await expect(
    stranger.query(api.waitlist.listRequests, {
      eventId,
      paginationOpts: { numItems: 10, cursor: null },
    })
  ).rejects.toThrow(/Not an admin/);

  const page1 = await org.query(api.waitlist.listRequests, {
    eventId,
    status: "pending",
    paginationOpts: { numItems: 1, cursor: null },
  });
  expect(page1.page).toHaveLength(1);
  expect(page1.page[0]).toMatchObject({
    email: "b@example.com",
    flaggedForReview: true,
  });
  expect(page1.isDone).toBe(false);

  const page2 = await org.query(api.waitlist.listRequests, {
    eventId,
    status: "pending",
    paginationOpts: { numItems: 10, cursor: page1.continueCursor },
  });
  expect(page2.page).toHaveLength(1);
  expect(page2.page[0]).toMatchObject({
    email: "a@example.com",
    flaggedForReview: false,
  });
  expect(page2.isDone).toBe(true);
});

test("codes.listPage paginates and filters by codeType; codes.summary aggregates blocks and terms", async () => {
  const { t, eventId, org, stranger } = await setupEvent();
  await t.run(async (ctx) => {
    await ctx.db.patch(eventId, { codeTypes: ["Pro", "Max"] });
    await ctx.db.insert("codes", {
      eventId,
      code: "PRO-1",
      codeType: "Pro",
      claimedBy: "a@example.com",
      claimedAt: 1000,
      expiresAt: 5000,
    });
    await ctx.db.insert("codes", {
      eventId,
      code: "PRO-2",
      codeType: "Pro",
      expiresAt: 6000,
    });
    await ctx.db.insert("codes", {
      eventId,
      code: "MAX-1",
      codeType: "Max",
    });
    await ctx.db.insert("stripeBatches", {
      name: "Pro",
      prefix: "PRO",
      amountCents: 2000,
      quantity: 2,
      redemptionsPerCode: 2,
      durationMonths: 3,
      live: false,
      createdBy: globalAdmin.email,
      requestId: "req-1",
      requestFingerprint: "fp-1",
      status: "complete",
      version: 1,
      codes: [
        { id: "promo_1", code: "PRO-1" },
        { id: "promo_2", code: "PRO-2" },
      ],
      targetEventId: eventId,
      eventId,
      codeType: "Pro",
    });
  });

  await expect(
    stranger.query(api.codes.listPage, {
      eventId,
      paginationOpts: { numItems: 10, cursor: null },
    })
  ).rejects.toThrow(/Not an admin/);

  const summary = await org.query(api.codes.summary, { eventId });
  expect(summary).toEqual({
    total: 3,
    claimed: 1,
    available: 2,
    dispensable: 1,
    stripeClaimed: 0,
    stripeSynced: 0,
    stripeRedeemed: 0,
    blockTypes: ["Pro", "Max"],
    blocks: [
      {
        type: "Pro",
        total: 2,
        claimed: 1,
        available: 1,
        expiryMin: 6000,
        expiryMax: 6000,
        hasNeverExpire: false,
        termsCount: 2,
        termsKind: { redemptions: 2, months: 3 },
        mixedTerms: false,
      },
      {
        type: "Max",
        total: 1,
        claimed: 0,
        available: 1,
        expiryMin: undefined,
        expiryMax: undefined,
        hasNeverExpire: true,
        termsCount: 0,
        termsKind: undefined,
        mixedTerms: false,
      },
    ],
  });

  const proPage1 = await org.query(api.codes.listPage, {
    eventId,
    codeType: "Pro",
    paginationOpts: { numItems: 1, cursor: null },
  });
  // by_event_codeType_claimedBy sorts unclaimed (undefined) before claimed.
  expect(proPage1.page.map((c) => c.code)).toEqual(["PRO-2"]);
  expect(proPage1.isDone).toBe(false);

  const proPage2 = await org.query(api.codes.listPage, {
    eventId,
    codeType: "Pro",
    paginationOpts: { numItems: 10, cursor: proPage1.continueCursor },
  });
  expect(proPage2.page.map((c) => c.code)).toEqual(["PRO-1"]);
  expect(proPage2.isDone).toBe(true);
});

test("emails.listPage and emails.summary support pagination, search, filters, and self-enrolling events", async () => {
  const { t, eventId, org } = await setupEvent();
  await t.run(async (ctx) => {
    await ctx.db.insert("emails", { eventId, email: "alice@example.com", name: "Alice" });
    await ctx.db.insert("emails", { eventId, email: "bob@example.com", name: "Bob" });
    await ctx.db.insert("emails", { eventId, email: "carol@example.com", blockedAt: 1234 });
    await ctx.db.insert("codes", {
      eventId,
      code: "CODE-A",
      claimedBy: "alice@example.com",
      claimedAt: 1000,
    });
  });

  expect(await org.query(api.emails.summary, { eventId })).toEqual({
    total: 3,
    claimed: 1,
    unclaimed: 2,
  });

  const p1 = await org.query(api.emails.listPage, {
    eventId,
    paginationOpts: { numItems: 2, cursor: null },
  });
  expect(p1.page).toMatchObject([
    { email: "alice@example.com", name: "Alice", claimed: true, claimedCodes: ["CODE-A"], blocked: false },
    { email: "bob@example.com", name: "Bob", claimed: false, claimedCodes: [], blocked: false },
  ]);
  expect(p1.isDone).toBe(false);

  const claimed = await org.query(api.emails.listPage, {
    eventId,
    filter: "claimed",
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(claimed.page.map((r) => r.email)).toEqual(["alice@example.com"]);

  const unclaimed = await org.query(api.emails.listPage, {
    eventId,
    filter: "unclaimed",
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(unclaimed.page.map((r) => r.email)).toEqual([
    "bob@example.com",
    "carol@example.com",
  ]);

  const searched = await org.query(api.emails.listPage, {
    eventId,
    search: "bob",
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(searched.page.map((r) => r.email)).toEqual(["bob@example.com"]);

  // Self-enrolling (dynamic) event paginates claimants from claimed codes,
  // and completes claimedCodes for a claimant split across a page boundary.
  const dyn = await setupEvent({ dynamic: true });
  await dyn.t.run(async (ctx) => {
    await ctx.db.insert("codes", {
      eventId: dyn.eventId,
      code: "DYN-1",
      codeType: "Pro",
      claimedBy: "walkup@example.com",
      claimedAt: 1000,
    });
    await ctx.db.insert("codes", {
      eventId: dyn.eventId,
      code: "DYN-2",
      codeType: "Max",
      claimedBy: "walkup@example.com",
      claimedAt: 1001,
    });
    await ctx.db.insert("codes", { eventId: dyn.eventId, code: "DYN-3" });
  });
  expect(await dyn.org.query(api.emails.summary, { eventId: dyn.eventId })).toEqual({
    total: 1,
    claimed: 1,
    unclaimed: 0,
  });
  const dynPage = await dyn.org.query(api.emails.listPage, {
    eventId: dyn.eventId,
    paginationOpts: { numItems: 1, cursor: null },
  });
  expect(dynPage.isDone).toBe(false);
  expect(dynPage.page).toEqual([
    {
      email: "walkup@example.com",
      name: undefined,
      claimed: true,
      claimedCodes: ["DYN-1", "DYN-2"],
    },
  ]);
});
