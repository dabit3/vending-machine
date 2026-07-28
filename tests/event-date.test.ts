import { describe, expect, it } from "vitest";

import {
  daysUntilEvent,
  eventCountdownLabel,
  formatEventDate,
} from "@/lib/event-date";

// Mid-afternoon so the tests also cover a `now` that is not midnight.
const now = new Date(2026, 6, 17, 15, 30);

describe("formatEventDate", () => {
  it("formats a YYYY-MM-DD date without shifting the day", () => {
    expect(formatEventDate("2026-07-17")).toBe("Jul 17, 2026");
  });

  it("returns the input unchanged when it is not a full date", () => {
    expect(formatEventDate("TBD")).toBe("TBD");
    expect(formatEventDate("2026-07")).toBe("2026-07");
  });
});

describe("daysUntilEvent", () => {
  it("counts whole calendar days, ignoring the time of day", () => {
    expect(daysUntilEvent("2026-07-17", now)).toBe(0);
    expect(daysUntilEvent("2026-07-18", now)).toBe(1);
    expect(daysUntilEvent("2026-07-24", now)).toBe(7);
  });

  it("is negative for past events", () => {
    expect(daysUntilEvent("2026-07-16", now)).toBe(-1);
  });

  it("counts across a DST boundary", () => {
    expect(daysUntilEvent("2026-11-02", new Date(2026, 9, 31, 9, 0))).toBe(2);
  });
});

describe("eventCountdownLabel", () => {
  it("labels the next two days by name", () => {
    expect(eventCountdownLabel("2026-07-17", now)).toBe("Today");
    expect(eventCountdownLabel("2026-07-18", now)).toBe("Tomorrow");
  });

  it("counts down further-out events", () => {
    expect(eventCountdownLabel("2026-07-24", now)).toBe("In 7 days");
  });

  it("has no label once the event has passed", () => {
    expect(eventCountdownLabel("2026-07-16", now)).toBeNull();
  });
});
