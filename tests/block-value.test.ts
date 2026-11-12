import { expect, test } from "vitest";
import { blockTermsSummary, blockValueSummary, codeValueSummary } from "../lib/block-value";

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

test("multi-month codes show the total with a monthly breakdown", () => {
  const twoMonths = { redemptions: 1, months: 2 };
  expect(blockTermsSummary("200", 2, [twoMonths, twoMonths])).toEqual({
    headline: "$400",
    detail: "$200 a month for 2 months",
  });
  expect(blockTermsSummary("200", 1, [{ redemptions: 2, months: 3 }])).toEqual({
    headline: "$1,200",
    detail: "$200 × 2 redemptions per code, each for 3 months",
  });
  expect(blockTermsSummary("Team plan", 1, [twoMonths])).toEqual({
    headline: "Team plan",
    detail: "Each code applies for 2 months",
  });
  expect(blockTermsSummary("200", 5, [twoMonths])).toEqual({
    headline: "$200",
    detail: "1 of 5 codes apply for 2 months ($400 each)",
  });
  expect(blockTermsSummary("200", 2, [twoMonths, { redemptions: 2, months: 1 }])).toEqual({
    headline: "$200",
    detail: "Codes in this block have different terms",
  });
});

test("dispensed code values include months and redemptions", () => {
  expect(codeValueSummary("200")).toEqual({ headline: "$200 in credits" });
  expect(codeValueSummary("200", { redemptions: 1, months: 1 })).toEqual({ headline: "$200 in credits" });
  expect(codeValueSummary("200", { redemptions: 1, months: 2 })).toEqual({
    headline: "$400 in credits total",
    detail: "$200 a month for 2 months",
  });
  expect(codeValueSummary("200", { redemptions: 2, months: 1 })).toEqual({
    headline: "$400 in credits total",
    detail: "$200 each time, redeemable 2 times",
  });
  expect(codeValueSummary("200", { redemptions: 2, months: 2 })).toEqual({
    headline: "$800 in credits total",
    detail: "$200 a month for 2 months, redeemable 2 times",
  });
  expect(codeValueSummary("Team plan", { redemptions: 2, months: 3 })).toEqual({
    headline: "Team plan",
    detail: "Applies for 3 months, redeemable 2 times",
  });
});

test("whole-dollar values get thousands separators", () => {
  expect(codeValueSummary("5000")).toEqual({ headline: "$5,000 in credits" });
  expect(codeValueSummary("5000", { redemptions: 2, months: 1 })).toEqual({
    headline: "$10,000 in credits total",
    detail: "$5,000 each time, redeemable 2 times",
  });
  expect(blockValueSummary("5000", 5, 0)).toEqual({ headline: "$5,000" });
  expect(blockValueSummary("1250000", 1, 0)).toEqual({ headline: "$1,250,000" });
  expect(blockValueSummary("5,000", 1, 0)).toEqual({ headline: "$5,000" });
  expect(blockValueSummary("5000 in usage", 1, 0)).toEqual({ headline: "$5,000 in usage" });
  expect(blockValueSummary("12.5", 1, 0)).toEqual({ headline: "$12.5" });
  expect(blockValueSummary("9999999999999999", 1, 0)).toEqual({
    headline: "$9,999,999,999,999,999",
  });
});
