"use node";

import { createHash, createHmac, randomBytes } from "node:crypto";
import Stripe from "stripe";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { truncateStripeBatchName } from "../lib/stripe-name";

function promotionCode(
  seed: string,
  prefix: string,
  index: number,
  attempt: number,
) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = createHmac("sha256", seed)
    .update(`${index}:${attempt}`)
    .digest();
  const suffix = Array.from(
    bytes.subarray(0, 10),
    (byte) => alphabet[byte % alphabet.length],
  ).join("");
  return prefix ? `${prefix}-${suffix}` : suffix;
}

export const generate = internalAction({
  args: { batchId: v.id("stripeBatches"), version: v.number() },
  handler: async (ctx, args) => {
    const key = process.env.STRIPE_API_KEY ?? "";
    const batch: Doc<"stripeBatches"> | null = await ctx.runMutation(
      internal.stripeBatches.begin,
      {
        ...args,
        seed: randomBytes(32).toString("hex"),
        keyFingerprint: createHash("sha256").update(key).digest("hex"),
      },
    );
    if (!batch) return;
    try {
      const stripe = new Stripe(key, {
        apiVersion: "2025-08-27.basil",
        maxNetworkRetries: 2,
        timeout: 15_000,
      });
      const authorize = async () => {
        if (!(await ctx.runQuery(internal.stripeBatches.authorized, args)))
          throw new Error("Authorization revoked");
      };
      let couponId = batch.couponId;
      if (!couponId) {
        await authorize();
        const name = truncateStripeBatchName(batch.name);
        const idempotencyKey =
          name === batch.name
            ? `vm:${batch._id}:coupon`
            : `vm:${batch._id}:coupon:name40`;
        const coupon = await stripe.coupons.create(
          {
            id: `vm_${batch._id}`,
            name,
            amount_off: batch.amountCents,
            currency: "usd",
            duration: "once",
            max_redemptions: batch.quantity * (batch.redemptionsPerCode ?? 1),
            ...(batch.expiresAt !== undefined && {
              redeem_by: batch.expiresAt / 1000,
            }),
            metadata: { vending_batch: batch._id },
          },
          { idempotencyKey },
        );
        couponId = coupon.id;
        await ctx.runMutation(internal.stripeBatches.saveCoupon, {
          ...args,
          couponId,
        });
      }
      const end = Math.min(batch.codes.length + 5, batch.quantity);
      for (let index = batch.codes.length; index < end; index++) {
        let saved = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          await authorize();
          const code = promotionCode(batch.seed!, batch.prefix, index, attempt);
          let promo;
          try {
            promo = await stripe.promotionCodes.create(
              {
                coupon: couponId,
                code,
                max_redemptions: batch.redemptionsPerCode ?? 1,
                ...(batch.expiresAt !== undefined && {
                  expires_at: batch.expiresAt / 1000,
                }),
                metadata: { vending_batch: batch._id },
              },
              { idempotencyKey: `vm:${batch._id}:promo:${index}:${attempt}` },
            );
          } catch (error) {
            if (
              error instanceof Stripe.errors.StripeInvalidRequestError &&
              (error.code === "resource_already_exists" ||
                /already exists/i.test(error.message))
            )
              continue;
            throw error;
          }
          await ctx.runMutation(internal.stripeBatches.recordCode, {
            ...args,
            index,
            id: promo.id,
            code: promo.code,
          });
          saved = true;
          break;
        }
        if (!saved) throw new Error("Code collision limit reached");
      }
      await ctx.runMutation(internal.stripeBatches.checkpoint, args);
    } catch {
      await ctx.runMutation(internal.stripeBatches.fail, {
        ...args,
        error:
          "Generation stopped. Saved codes are safe. Check Stripe permissions and configuration, then retry this batch to resume without duplicates.",
      });
    }
  },
});
