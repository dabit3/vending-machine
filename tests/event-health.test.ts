import { expect, test } from "vitest";
import {
  eventNeedsAttention,
  getStockStatus,
  summarizeDashboardAlerts,
  type EventHealthStats,
} from "../lib/event-health";

function stats(overrides: Partial<EventHealthStats> = {}): EventHealthStats {
  return {
    totalCodes: 50,
    claimedCodes: 10,
    remainingCodes: 40,
    pendingRequests: 0,
    flaggedCount: 0,
    stripeClaimedCodes: 0,
    stripeRedeemedCodes: 0,
    stripeSyncedCodes: 0,
    ...overrides,
  };
}

test("getStockStatus distinguishes none, empty, low, and healthy pools", () => {
  expect(getStockStatus({ totalCodes: 0, remainingCodes: 0 })).toBe("none");
  expect(getStockStatus({ totalCodes: 20, remainingCodes: 0 })).toBe("empty");
  expect(getStockStatus({ totalCodes: 100, remainingCodes: 10 })).toBe("low");
  expect(getStockStatus({ totalCodes: 100, remainingCodes: 11 })).toBe("ok");
  expect(getStockStatus({ totalCodes: 20, remainingCodes: 5 })).toBe("low");
  expect(getStockStatus({ totalCodes: 20, remainingCodes: 6 })).toBe("ok");
  // Small fresh pools (e.g. 5/5 or 1/1) are not falsely flagged as low stock.
  expect(getStockStatus({ totalCodes: 5, remainingCodes: 5 })).toBe("ok");
  expect(getStockStatus({ totalCodes: 5, remainingCodes: 2 })).toBe("low");
  expect(getStockStatus({ totalCodes: 1, remainingCodes: 1 })).toBe("ok");
});

test("eventNeedsAttention checks queues always and stock only on active events", () => {
  expect(eventNeedsAttention(undefined, true)).toBe(false);
  expect(eventNeedsAttention(stats(), true)).toBe(false);
  expect(
    eventNeedsAttention(stats({ totalCodes: 20, remainingCodes: 0 }), true),
  ).toBe(true);
  expect(
    eventNeedsAttention(stats({ totalCodes: 20, remainingCodes: 0 }), false),
  ).toBe(false);
  expect(eventNeedsAttention(stats({ pendingRequests: 1 }), false)).toBe(true);
  expect(eventNeedsAttention(stats({ flaggedCount: 2 }), false)).toBe(true);
});

test("summarizeDashboardAlerts aggregates stock and queue counts across events", () => {
  const summary = summarizeDashboardAlerts([
    {
      _id: "e1",
      isActive: true,
      stats: stats({ totalCodes: 10, remainingCodes: 0, pendingRequests: 2 }),
    },
    {
      _id: "e2",
      isActive: true,
      stats: stats({ totalCodes: 50, remainingCodes: 4, flaggedCount: 3 }),
    },
    {
      _id: "e3",
      isActive: false,
      stats: stats({ totalCodes: 10, remainingCodes: 0, pendingRequests: 1 }),
    },
    {
      _id: "e4",
      isActive: true,
      stats: stats({ totalCodes: 50, remainingCodes: 45 }),
    },
  ]);

  expect(summary.outOfStockCount).toBe(1);
  expect(summary.lowStockCount).toBe(1);
  expect(summary.pendingRequestsTotal).toBe(3);
  expect(summary.pendingRequestsEvents).toBe(2);
  expect(summary.flaggedTotal).toBe(3);
  expect(summary.flaggedEvents).toBe(1);
  expect([...summary.attentionEventIds].sort()).toEqual(["e1", "e2", "e3"]);
});
