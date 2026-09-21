import { expect, test } from "vitest";
import { filterEmails } from "../lib/email-search";

const items = [
  { email: "ada@example.com" },
  { email: "Grace@Hopper.dev" },
  { email: "linus@example.org" },
];

test("blank or whitespace queries keep every email", () => {
  expect(filterEmails(items, "")).toBe(items);
  expect(filterEmails(items, "   ")).toBe(items);
});

test("matches any part of the address, ignoring case and surrounding spaces", () => {
  expect(filterEmails(items, "EXAMPLE").map((i) => i.email)).toEqual([
    "ada@example.com",
    "linus@example.org",
  ]);
  expect(filterEmails(items, " grace@ ").map((i) => i.email)).toEqual([
    "Grace@Hopper.dev",
  ]);
  expect(filterEmails(items, ".dev")).toHaveLength(1);
  expect(filterEmails(items, "nobody")).toEqual([]);
});

const tracked = [
  { email: "ada@example.com", claimed: true },
  { email: "Grace@Hopper.dev", claimed: false },
  { email: "linus@example.org", claimed: false },
];

test("status filter keeps only claimed or unclaimed addresses", () => {
  expect(filterEmails(tracked, "", "all")).toBe(tracked);
  expect(filterEmails(tracked, "", "claimed").map((i) => i.email)).toEqual([
    "ada@example.com",
  ]);
  expect(filterEmails(tracked, "", "unclaimed").map((i) => i.email)).toEqual([
    "Grace@Hopper.dev",
    "linus@example.org",
  ]);
  // Items without a claimed flag count as unclaimed.
  expect(filterEmails(items, "", "claimed")).toEqual([]);
  expect(filterEmails(items, "", "unclaimed")).toEqual(items);
});

test("status filter composes with the search query", () => {
  expect(
    filterEmails(tracked, "example", "unclaimed").map((i) => i.email)
  ).toEqual(["linus@example.org"]);
  expect(filterEmails(tracked, "example", "claimed")).toHaveLength(1);
  expect(filterEmails(tracked, "hopper", "claimed")).toEqual([]);
});
