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
