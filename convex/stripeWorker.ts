"use node";

import { createHash, createHmac, randomBytes } from "node:crypto";
import Stripe from "stripe";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { truncateStripeBatchName } from "../lib/stripe-name";
import { STRIPE_SYNC_CHUNK, stripeMode } from "./stripeValidation";

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
            ...((batch.durationMonths ?? 1) > 1
              ? {
                  duration: "repeating" as const,
                  duration_in_months: batch.durationMonths,
                }
              : { duration: "once" as const }),
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

// Flips `active` on one page of a block's promotion codes, then schedules the
// next page. A newer archive/unarchive bumps the sync version; when that
// happens after this worker already fetched its page, its Stripe writes are
// stale, so it starts a repair pass over the whole block for the new version.
export const setBlockActive = internalAction({
  args: {
    eventId: v.id("events"),
    codeType: v.optional(v.string()),
    version: v.number(),
    after: v.optional(v.string()),
    count: v.boolean(),
  },
  handler: async (ctx, args) => {
    const report = (progress: {
      updated: number;
      failed: number;
      error?: string;
      done: boolean;
    }) =>
      ctx.runMutation(internal.codes.stripeSyncProgress, {
        eventId: args.eventId,
        codeType: args.codeType,
        version: args.version,
        count: args.count,
        ...progress,
      });
    try {
      const chunk = await ctx.runQuery(internal.codes.stripeSyncChunk, {
        eventId: args.eventId,
        codeType: args.codeType,
        version: args.version,
        after: args.after,
        limit: STRIPE_SYNC_CHUNK,
      });
      if (!chunk) return;
      const mode = stripeMode();
      const stripe = new Stripe(process.env.STRIPE_API_KEY ?? "", {
        apiVersion: "2025-08-27.basil",
        maxNetworkRetries: 2,
        timeout: 15_000,
      });
      let updated = 0;
      let failed = 0;
      let error: string | undefined;
      for (const item of chunk.items) {
        try {
          if (!item.promoId)
            throw new Error(`No Stripe promotion code recorded for ${item.code}`);
          if (item.live !== null && item.live !== mode.live)
            throw new Error(
              `${item.code} was created in Stripe ${item.live ? "live" : "test"} mode, but this deployment's key is for ${mode.live ? "live" : "test"} mode`,
            );
          await stripe.promotionCodes.update(item.promoId, {
            active: chunk.active,
          });
          updated++;
        } catch (err) {
          failed++;
          error ??= err instanceof Error ? err.message : String(err);
        }
      }
      const progress = await report({ updated, failed, error, done: chunk.done });
      if (!progress) return;
      if (progress.superseded) {
        await ctx.scheduler.runAfter(0, internal.stripeWorker.setBlockActive, {
          eventId: args.eventId,
          codeType: args.codeType,
          version: progress.version,
          count: false,
        });
        return;
      }
      if (!chunk.done)
        await ctx.scheduler.runAfter(0, internal.stripeWorker.setBlockActive, {
          ...args,
          after: chunk.items[chunk.items.length - 1]?.code ?? args.after,
        });
    } catch (err) {
      await report({
        updated: 0,
        failed: 0,
        error: err instanceof Error ? err.message : String(err),
        done: true,
      });
    }
  },
});

const MAX_PROMO_LIST_PAGES = 20;

// Checks Stripe for how many times each claimed Stripe-generated code on an
// event has been redeemed, then records the results on the codes and event.
export const syncEventRedemptions = internalAction({
  args: {
    eventId: v.id("events"),
    version: v.number(),
  },
  handler: async (ctx, args) => {
    const record = (payload: {
      results: { codeId: Doc<"codes">["_id"]; timesRedeemed: number }[];
      failed: number;
      error?: string;
    }) =>
      ctx.runMutation(internal.codes.recordStripeRedemptions, {
        eventId: args.eventId,
        version: args.version,
        ...payload,
      });
    try {
      const plan = await ctx.runQuery(internal.codes.stripeRedemptionPlan, {
        eventId: args.eventId,
        version: args.version,
      });
      if (!plan) return;
      const mode = stripeMode();
      const stripe = new Stripe(process.env.STRIPE_API_KEY ?? "", {
        apiVersion: "2025-08-27.basil",
        maxNetworkRetries: 2,
        timeout: 15_000,
      });

      const results: { codeId: Doc<"codes">["_id"]; timesRedeemed: number }[] = [];
      let failed = 0;
      let error: string | undefined;

      for (const batch of plan.batches) {
        if (batch.live !== null && batch.live !== mode.live) {
          failed += batch.items.length;
          error ??= `Batch was created in Stripe ${batch.live ? "live" : "test"} mode, but this deployment's key is for ${mode.live ? "live" : "test"} mode`;
          continue;
        }
        if (batch.couponId) {
          try {
            const byPromoId = new Map<string, number>();
            const byCode = new Map<string, number>();
            let startingAfter: string | undefined;
            for (let pageIndex = 0; pageIndex < MAX_PROMO_LIST_PAGES; pageIndex++) {
              const page = await stripe.promotionCodes.list({
                coupon: batch.couponId,
                limit: 100,
                ...(startingAfter ? { starting_after: startingAfter } : {}),
              });
              for (const promo of page.data) {
                byPromoId.set(promo.id, promo.times_redeemed);
                byCode.set(promo.code, promo.times_redeemed);
              }
              if (!page.has_more || page.data.length === 0) break;
              startingAfter = page.data[page.data.length - 1].id;
            }
            for (const item of batch.items) {
              const redeemed =
                (item.promoId ? byPromoId.get(item.promoId) : undefined) ??
                byCode.get(item.code);
              if (redeemed === undefined) {
                failed++;
                error ??= `No Stripe promotion code found for ${item.code}`;
              } else {
                results.push({ codeId: item.codeId, timesRedeemed: redeemed });
              }
            }
          } catch (err) {
            failed += batch.items.length;
            error ??= err instanceof Error ? err.message : String(err);
          }
        } else {
          for (const item of batch.items) {
            try {
              if (!item.promoId) {
                throw new Error(`No Stripe promotion code recorded for ${item.code}`);
              }
              const promo = await stripe.promotionCodes.retrieve(item.promoId);
              results.push({
                codeId: item.codeId,
                timesRedeemed: promo.times_redeemed,
              });
            } catch (err) {
              failed++;
              error ??= err instanceof Error ? err.message : String(err);
            }
          }
        }
      }

      await record({ results, failed, error });
    } catch (err) {
      await record({
        results: [],
        failed: 1,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});
