import { expect, test } from "vitest";
import { emptyStripeForm, generationInput } from "../lib/stripe-form";

const form = { ...emptyStripeForm, name: "Credits", amount: "19.99" };
const requestId = "request-1234567890";

test("converts decimal USD input to integer cents and preserves the reviewed mode", () => {
  expect(generationInput(form, true, requestId)).toMatchObject({
    amountCents: 1999,
    quantity: 100,
    expectedLive: true,
    confirmLive: true,
    requestId,
  });
});

test("defaults to one redemption and accepts two", () => {
  expect(emptyStripeForm.redemptionsPerCode).toBe("1");
  expect(generationInput(form, false, requestId).redemptionsPerCode).toBe(1);
  expect(generationInput({ ...form, redemptionsPerCode: "2" }, false, requestId).redemptionsPerCode).toBe(2);
});

test.each(["", "0", "3", "1.5", "NaN", "Infinity"])("rejects invalid redemptions per code %j", (redemptionsPerCode) => {
  expect(() => generationInput({ ...form, redemptionsPerCode }, false, requestId)).toThrow("once or twice");
});

test.each([39, 40, 41, 80, 81, 120])(
  "silently limits a %i-character batch name to 40 characters",
  (length) => {
    const name = "N".repeat(length);
    expect(generationInput({ ...form, name }, false, requestId).name).toBe(
      name.slice(0, 40),
    );
  },
);

test("trims names without leaving trailing whitespace or splitting a Unicode character", () => {
  expect(
    generationInput(
      { ...form, name: `  ${"N".repeat(39)} suffix  ` },
      false,
      requestId,
    ).name,
  ).toBe("N".repeat(39));
  expect(
    generationInput(
      { ...form, name: `${"N".repeat(39)}\u{1D400}suffix` },
      false,
      requestId,
    ).name,
  ).toBe("N".repeat(39));
  expect(
    generationInput(
      { ...form, name: `${"N".repeat(38)}\u{1D400}suffix` },
      false,
      requestId,
    ).name,
  ).toBe(`${"N".repeat(38)}\u{1D400}`);
  expect(() =>
    generationInput({ ...form, name: "   " }, false, requestId),
  ).toThrow("batch name");
});

test.each(["1.001", "", "Infinity", "NaN", "1e2", "-50", "0", "1000000"])(
  "rejects invalid amount %s",
  (amount) => {
    expect(() =>
      generationInput({ ...form, amount }, false, requestId),
    ).toThrow();
  },
);

test("rejects past expiration and punctuation-only prefixes", () => {
  expect(() =>
    generationInput({ ...form, expiration: "2020-01-01" }, false, requestId),
  ).toThrow("future");
  expect(() =>
    generationInput({ ...form, prefix: "---" }, false, requestId),
  ).toThrow("up to 4 letters");
});

test.each(["a", "abcd", " AbCd "])("normalizes the optional letter prefix %j", (prefix) => {
  expect(generationInput({ ...form, prefix }, false, requestId).codePrefix).toBe(
    prefix.trim().toUpperCase(),
  );
});

test.each(["ABCDE", "A1", "1234", "A-B", "A B", "é", "ß", "AB_CD"])(
  "rejects the invalid code prefix %j",
  (prefix) => {
    expect(() => generationInput({ ...form, prefix }, false, requestId)).toThrow("up to 4 letters");
  },
);

test.each(["", "   "])("leaves a blank prefix for server-side generation", (prefix) => {
  expect(generationInput({ ...form, prefix }, false, requestId).codePrefix).toBe("");
});
