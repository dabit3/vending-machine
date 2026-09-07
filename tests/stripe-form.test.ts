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
  ).toThrow("letter or number");
});
