import { ConvexError } from "convex/values";
import type { GenerationInput } from "@/convex/stripeValidation";

export type StripeForm = {
  name: string;
  amount: string;
  quantity: string;
  prefix: string;
  expiration: string;
};
export const emptyStripeForm: StripeForm = {
  name: "",
  amount: "50",
  quantity: "100",
  prefix: "",
  expiration: "",
};
export const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );

export function generationInput(
  form: StripeForm,
  live: boolean,
  requestId: string,
): GenerationInput {
  if (!/^\d+(\.\d{1,2})?$/.test(form.amount))
    throw new Error("Enter a USD amount with at most two decimal places.");
  const amountCents = Math.round(Number(form.amount) * 100);
  const quantity = Number(form.quantity);
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1 ||
    amountCents > 99_999_999
  )
    throw new Error("Enter a value between $0.01 and $999,999.99.");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500)
    throw new Error("Enter a quantity between 1 and 500.");
  if (!form.name.trim() || form.name.trim().length > 80)
    throw new Error("Enter a batch name of 1–80 characters.");
  const expiresAt = form.expiration
    ? new Date(`${form.expiration}T23:59:59`).getTime()
    : undefined;
  if (
    expiresAt !== undefined &&
    (!Number.isFinite(expiresAt) || expiresAt <= Date.now())
  )
    throw new Error("Expiration must be in the future.");
  if (form.prefix.trim() && !/[a-z0-9]/i.test(form.prefix))
    throw new Error("The prefix must include a letter or number.");
  return {
    name: form.name.trim(),
    amountCents,
    quantity,
    codePrefix: form.prefix,
    expiresAt,
    expectedLive: live,
    confirmLive: live,
    requestId,
  };
}

export function mutationError(error: unknown, fallback: string) {
  return error instanceof ConvexError && typeof error.data === "string"
    ? error.data
    : fallback;
}
