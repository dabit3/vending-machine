import { describe, expect, it } from "vitest";

import { daysUntilEvent, eventCountdownLabel, formatEventDate } from "./event-date";

const now = new Date(2026, 6, 18, 9, 30);

describe("formatEventDate", () => {
  it("formats a YYYY-MM-DD date in local time", () => {
    expect(formatEventDate("2026-07-17")).toBe("Jul 17, 2026");
  });

  it("passes through values it cannot parse", () => {
    expect(formatEventDate("TBD")).toBe("TBD");
  });
});

describe("daysUntilEvent", () => {
  it("ignores the time of day on both sides", () => {
    expect(daysUntilEvent("2026-07-18", now)).toBe(0);
    expect(daysUntilEvent("2026-07-19", now)).toBe(1);
    expect(daysUntilEvent("2026-08-01", now)).toBe(14);
  });

  it("is negative for past events", () => {
    expect(daysUntilEvent("2026-07-11", now)).toBe(-7);
  });
});

describe("eventCountdownLabel", () => {
  it("labels today and tomorrow by name", () => {
    expect(eventCountdownLabel("2026-07-18", now)).toBe("Today");
    expect(eventCountdownLabel("2026-07-19", now)).toBe("Tomorrow");
  });

  it("counts the remaining days for later events", () => {
    expect(eventCountdownLabel("2026-07-21", now)).toBe("In 3 days");
  });

  it("returns null once the event has passed", () => {
    expect(eventCountdownLabel("2026-07-17", now)).toBeNull();
  });
});
