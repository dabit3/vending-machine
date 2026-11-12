import { expect, test } from "vitest";
import { stillHeld } from "../lib/receipt";

const max = { code: "MAX-1", codeType: "Max" };
const usage = { code: "USAGE-1", codeType: "Usage" };

test("the receipt keeps every code while the live list is unknown", () => {
  expect(stillHeld([max, usage], undefined)).toEqual([max, usage]);
});

test("a released code leaves the receipt and the other stays", () => {
  expect(stillHeld([max, usage], [{ code: "MAX-1" }])).toEqual([max]);
});

test("releasing the only code empties the receipt", () => {
  expect(stillHeld([max], [])).toEqual([]);
});

test("a code dispensed again in place of a released one is not shown as the old one", () => {
  expect(stillHeld([max, usage], [{ code: "MAX-1" }, { code: "USAGE-2" }])).toEqual([max]);
});
