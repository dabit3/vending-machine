import { ConvexError, v } from "convex/values";

export const generationFields = {
  name: v.string(),
  codePrefix: v.optional(v.string()),
  amountCents: v.number(),
  quantity: v.number(),
  expiresAt: v.optional(v.number()),
  expectedLive: v.boolean(),
  confirmLive: v.boolean(),
  requestId: v.string(),
};

export type GenerationInput = {
  name: string;
  codePrefix?: string;
  amountCents: number;
  quantity: number;
  expiresAt?: number;
  expectedLive: boolean;
  confirmLive: boolean;
  requestId: string;
};

export function stripeMode() {
  const match = /^(?:sk|rk)_(live|test)_\S+$/.exec(
    process.env.STRIPE_API_KEY ?? "",
  );
  return match
    ? { configured: true, live: match[1] === "live" }
    : { configured: false, live: false };
}

export function validateGeneration(input: GenerationInput) {
  const name = input.name.trim();
  if (!name || name.length > 80)
    throw new ConvexError("Enter a batch name of 1–80 characters.");
  if (
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents < 1 ||
    input.amountCents > 99_999_999
  ) {
    throw new ConvexError(
      "Enter a USD value between $0.01 and $999,999.99, with at most two decimal places.",
    );
  }
  if (
    !Number.isInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 500
  ) {
    throw new ConvexError("Generate between 1 and 500 codes per batch.");
  }
  const rawPrefix = input.codePrefix?.trim() ?? "";
  if (rawPrefix.length > 100)
    throw new ConvexError("The code prefix is too long.");
  const prefix = rawPrefix
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
  if (rawPrefix && !prefix)
    throw new ConvexError("The prefix must include a letter or number.");
  if (
    input.expiresAt !== undefined &&
    (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= Date.now())
  ) {
    throw new ConvexError("Expiration must be in the future.");
  }
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(input.requestId))
    throw new ConvexError("Invalid request ID.");
  const mode = stripeMode();
  if (!mode.configured)
    throw new ConvexError(
      "Stripe is not configured. Set STRIPE_API_KEY on the Convex deployment.",
    );
  if (mode.live !== input.expectedLive)
    throw new ConvexError(
      "Stripe mode changed. Refresh and review the batch again.",
    );
  if (mode.live && !input.confirmLive)
    throw new ConvexError("Confirm live-mode code creation before continuing.");
  return {
    name,
    prefix,
    amountCents: input.amountCents,
    quantity: input.quantity,
    expiresAt:
      input.expiresAt === undefined
        ? undefined
        : Math.floor(input.expiresAt / 1000) * 1000,
    live: mode.live,
  };
}
