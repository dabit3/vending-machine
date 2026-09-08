import { convexToJson } from "convex/values";
import { expect, test } from "vitest";
import { blockKey, blockValue } from "../convex/blockValues";

test.each([
  "Itaú Hackathon",
  "Créditos",
  "東京",
  "Devin \u{1d400}",
  "Line\nBreak",
  "Tab\tName",
  "Code\u0000Block",
  "Code\u007fBlock",
  "$Créditos",
  "_Créditos",
  "\ud800",
  "é".repeat(80),
])("stores the block name %j under a valid Convex object key", (name) => {
  const key = blockKey(name);
  expect(() => convexToJson({ codeTypeValues: { [key]: "50" } })).not.toThrow();
  expect(key).toMatch(/^[\x20-\x7e]+$/);
  expect(key.length).toBeLessThanOrEqual(1024);
  expect(blockValue({ codeTypeValues: { [key]: "50" } }, name)).toBe("50");
});

test.each([
  { name: undefined, key: "" },
  { name: "", key: "" },
  { name: "Conference credits", key: "Conference credits" },
  { name: "$50 credits", key: " $50 credits" },
  { name: "_Credits", key: " _Credits" },
  { name: "100% credits", key: "100% credits" },
])("preserves the existing key for $name", ({ name, key }) => {
  expect(blockKey(name)).toBe(key);
  expect(blockValue({ codeTypeValues: { [key]: "25" } }, name)).toBe("25");
});

test("encoded keys do not collide with ASCII names or other Unicode names", () => {
  const names = [
    "Itau Hackathon",
    "Itaú Hackathon",
    "é",
    "e\u0301",
    "\u{1d400}",
    "\u{1d401}",
    "$50",
    "_Credits",
    "~00e9",
    blockKey("Itaú Hackathon").trim(),
  ];
  expect(new Set(names.map(blockKey)).size).toBe(names.length);
});

test("missing Unicode block values still use the legacy event-wide value", () => {
  expect(blockValue({ creditAmount: "100" }, "Itaú Hackathon")).toBe("100");
  expect(blockValue({}, "Itaú Hackathon")).toBeUndefined();
});
