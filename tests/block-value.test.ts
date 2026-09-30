import { expect, test } from "vitest";
import { blockValueSummary } from "../lib/block-value";

test("single-use blocks show the value as entered", () => {
  expect(blockValueSummary("20", 5, 0)).toEqual({ headline: "$20" });
  expect(blockValueSummary("Team plan", 5, 0)).toEqual({ headline: "Team plan" });
});

test("codes that redeem twice show the total with a per-redemption breakdown", () => {
  expect(blockValueSummary("200", 3, 3)).toEqual({
    headline: "$400",
    detail: "$200 × 2 redemptions per code",
  });
  expect(blockValueSummary("12.5", 1, 1)).toEqual({
    headline: "$25",
    detail: "$12.5 × 2 redemptions per code",
  });
  expect(blockValueSummary("Team plan", 2, 2)).toEqual({
    headline: "Team plan",
    detail: "Each code redeems twice",
  });
});

test("blocks mixing single- and double-use codes say how many redeem twice", () => {
  expect(blockValueSummary("200", 5, 2)).toEqual({
    headline: "$200",
    detail: "2 of 5 codes redeem twice ($400 each)",
  });
});
