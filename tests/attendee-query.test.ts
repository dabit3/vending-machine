import { expect, test } from "vitest";
import { looksLikeAttendeeQuery } from "../lib/attendee-identity";

test("emails, handles and X links are attendee queries", () => {
  for (const q of ["ada@example.com", "@ada", " @Ada ", "x.com/ada", "https://twitter.com/ada"]) {
    expect(looksLikeAttendeeQuery(q)).toBe(true);
  }
});

test("event names are not attendee queries", () => {
  for (const q of ["", "hackathon", "SF Devin Day", "ada", "next.js conf"]) {
    expect(looksLikeAttendeeQuery(q)).toBe(false);
  }
});
