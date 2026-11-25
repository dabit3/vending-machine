import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { nextAvailable, probeBlockCode } from "../convex/claims";
import schema from "../convex/schema";
import { withClaimRetry } from "../lib/claim-retry";

const modules = import.meta.glob("../convex/**/*.ts");
const adminIdentity = {
  subject: "admin",
  email: "admin@example.com",
  emailVerified: true,
};

function attendee(i: number) {
  return {
    subject: `user-${i}`,
    email: `attendee-${i}@example.com`,
    emailVerified: true,
  };
}

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("admins", { email: adminIdentity.email }));
  return { t, admin: t.withIdentity(adminIdentity) };
}

describe("concurrent claims and live event subscription isolation", () => {
  test("40 concurrent attendees on a dynamic drop all receive distinct codes", async () => {
    const { t, admin } = await setup();
    const event = await admin.mutation(api.events.create, {
      name: "Live Drop",
      slug: "live-drop",
      dynamic: true,
    });
    const pool = Array.from({ length: 50 }, (_, i) => `DROP-${i + 1}`);
    const added = await admin.mutation(api.codes.add, {
      eventId: event.id,
      codes: pool,
      codeType: "Pro",
    });
    expect(added).toEqual({ added: 50, skipped: 0 });

    // Every newly inserted code gets a uniform random claimKey in [0, 1).
    const keys = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("codes")
        .withIndex("by_event", (q) => q.eq("eventId", event.id))
        .collect();
      return rows.map((r) => r.claimKey);
    });
    expect(keys.every((k) => typeof k === "number" && k >= 0 && k < 1)).toBe(
      true
    );

    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        t.withIdentity(attendee(i)).mutation(api.claims.claim, {
          slug: event.slug,
          name: `Attendee ${i}`,
        })
      )
    );

    expect(results.every((r) => r.ok)).toBe(true);
    const claimedCodes = results.map((r) => (r.ok ? r.code : ""));
    expect(new Set(claimedCodes).size).toBe(40);
    for (const code of claimedCodes) expect(pool).toContain(code);

    const remaining = await t.run(async (ctx) =>
      ctx.db
        .query("codes")
        .withIndex("by_event_claimedBy", (q) =>
          q.eq("eventId", event.id).eq("claimedBy", undefined)
        )
        .collect()
    );
    expect(remaining).toHaveLength(10);
  });

  test("20 concurrent attendees on a multi-block 'all' drop get distinct pairs", async () => {
    const { t, admin } = await setup();
    const event = await admin.mutation(api.events.create, {
      name: "All-Mode Drop",
      slug: "all-drop",
      dynamic: true,
      claimMode: "all",
    });
    await admin.mutation(api.codes.add, {
      eventId: event.id,
      codes: Array.from({ length: 25 }, (_, i) => `PRO-${i + 1}`),
      codeType: "Pro",
    });
    await admin.mutation(api.codes.add, {
      eventId: event.id,
      codes: Array.from({ length: 25 }, (_, i) => `API-${i + 1}`),
      codeType: "API",
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        t.withIdentity(attendee(i)).mutation(api.claims.claim, {
          slug: event.slug,
          name: `Attendee ${i}`,
        })
      )
    );

    expect(results.every((r) => r.ok)).toBe(true);
    const proCodes = new Set<string>();
    const apiCodes = new Set<string>();
    for (const res of results) {
      if (!res.ok) throw new Error("claim failed");
      expect(res.codes).toHaveLength(2);
      proCodes.add(res.codes[0].code);
      apiCodes.add(res.codes[1].code);
    }
    expect(proCodes.size).toBe(20);
    expect(apiCodes.size).toBe(20);
  });

  test("distinct claim cursors select codes from disjoint index ranges", async () => {
    const { t } = await setup();
    const eventId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("events", {
        name: "Sharded Pool",
        slug: "sharded",
        codeTypes: ["Pro"],
      });
      for (let i = 0; i < 100; i++) {
        await ctx.db.insert("codes", {
          eventId: id,
          code: `C-${i}`,
          codeType: "Pro",
          claimKey: (i + 0.5) / 100,
        });
      }
      return id;
    });

    const cursors = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    const picks = await t.run(async (ctx) => {
      const event = (await ctx.db.get(eventId))!;
      return await Promise.all(
        cursors.map(async (cursor) => {
          const picked = await nextAvailable(ctx, event, "Pro", cursor);
          return { cursor, code: picked!.code, claimKey: picked!.claimKey! };
        })
      );
    });

    // Every cursor selects a distinct code in its own [cursor, cursor + 0.02]
    // band, so concurrent mutations read disjoint index ranges and avoid OCC
    // write conflicts.
    expect(new Set(picks.map((p) => p.code)).size).toBe(cursors.length);
    for (let i = 0; i < picks.length; i++) {
      expect(picks[i].claimKey).toBeGreaterThanOrEqual(picks[i].cursor);
      expect(picks[i].claimKey).toBeLessThan(picks[i].cursor + 0.02);
      if (i > 0) {
        expect(picks[i].cursor).toBeGreaterThan(picks[i - 1].claimKey);
      }
    }
  });

  test("events.getBySlug sentinel row is never touched until the final code is claimed", async () => {
    const { t, admin } = await setup();
    const event = await admin.mutation(api.events.create, {
      name: "Sentinel Event",
      slug: "sentinel",
      dynamic: true,
    });
    const pool = Array.from({ length: 20 }, (_, i) => `SENT-${i + 1}`);
    await admin.mutation(api.codes.add, {
      eventId: event.id,
      codes: pool,
      codeType: "Credits",
    });

    const sentinel = await t.run((ctx) =>
      probeBlockCode(ctx, event.id, "Credits")
    );
    expect(sentinel).not.toBeNull();

    // First 19 claims (including wrap-around cursors above the sentinel) must
    // never patch the sentinel row or write into [sentinel.claimKey, +inf).
    for (let i = 0; i < 19; i++) {
      const res = await t
        .withIdentity(attendee(i))
        .mutation(api.claims.claim, {
          slug: event.slug,
          name: `Attendee ${i}`,
        });
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error("claim failed");
      expect(res.code).not.toBe(sentinel!.code);

      const currentSentinel = await t.run((ctx) =>
        probeBlockCode(ctx, event.id, "Credits")
      );
      expect(currentSentinel?._id).toBe(sentinel!._id);
      expect(currentSentinel?.claimedBy).toBeUndefined();
    }

    expect(
      await t.query(api.events.getBySlug, { slug: event.slug })
    ).toMatchObject({ soldOut: false, codeTypes: ["Credits"] });

    // The 20th and final claim dispenses the sentinel and flips soldOut.
    const last = await t
      .withIdentity(attendee(19))
      .mutation(api.claims.claim, {
        slug: event.slug,
        name: "Last Attendee",
      });
    expect(last).toMatchObject({ ok: true, code: sentinel!.code });
    expect(
      await t.query(api.events.getBySlug, { slug: event.slug })
    ).toMatchObject({ soldOut: true, codeTypes: [] });
  });

  test("sentinel isolation also holds for legacy codes without claimKey and backfill populates them", async () => {
    const { t } = await setup();
    const eventId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("events", {
        name: "Legacy Pool",
        slug: "legacy-pool",
        dynamic: true,
        codeTypes: ["Credits"],
      });
      for (let i = 1; i <= 5; i++) {
        await ctx.db.insert("codes", {
          eventId: id,
          code: `OLD-${i}`,
          codeType: "Credits",
        });
      }
      return id;
    });

    const sentinel = await t.run((ctx) =>
      probeBlockCode(ctx, eventId, "Credits")
    );
    expect(sentinel).not.toBeNull();

    // First 4 claims leave the sentinel untouched.
    for (let i = 0; i < 4; i++) {
      const res = await t
        .withIdentity(attendee(i))
        .mutation(api.claims.claim, {
          slug: "legacy-pool",
          name: `Attendee ${i}`,
        });
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error("claim failed");
      expect(res.code).not.toBe(sentinel!.code);
    }
    const stillSentinel = await t.run((ctx) =>
      probeBlockCode(ctx, eventId, "Credits")
    );
    expect(stillSentinel?._id).toBe(sentinel!._id);

    // Backfill assigns claimKey to remaining unclaimed legacy codes and leaves
    // already-claimed rows untouched.
    await t.mutation(internal.codes.backfillClaimKeys, {});
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("codes")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .collect()
    );
    const unclaimed = rows.filter((r) => r.claimedBy === undefined);
    const claimed = rows.filter((r) => r.claimedBy !== undefined);
    expect(unclaimed).toHaveLength(1);
    expect(typeof unclaimed[0].claimKey).toBe("number");
    expect(claimed.every((r) => r.claimKey === undefined)).toBe(true);

    // Final claim takes the last code and marks the event sold out.
    const final = await t
      .withIdentity(attendee(4))
      .mutation(api.claims.claim, {
        slug: "legacy-pool",
        name: "Final Attendee",
      });
    expect(final).toMatchObject({ ok: true, code: sentinel!.code });
    expect(
      await t.query(api.events.getBySlug, { slug: "legacy-pool" })
    ).toMatchObject({ soldOut: true, codeTypes: [] });
  });

  test("sentinel probe skips expired and reserved codes at the top of claimKey", async () => {
    const { t } = await setup();
    const vip = attendee(99);
    const eventId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("events", {
        name: "Filtered Sentinel",
        slug: "filtered-sentinel",
        dynamic: true,
        codeTypes: ["Pro"],
      });
      await ctx.db.insert("codes", {
        eventId: id,
        code: "EXPIRED-TOP",
        codeType: "Pro",
        claimKey: 0.99,
        expiresAt: Date.now() - 1000,
      });
      await ctx.db.insert("codes", {
        eventId: id,
        code: "RESERVED-TOP",
        codeType: "Pro",
        claimKey: 0.98,
        reservedFor: vip.email,
      });
      await ctx.db.insert("codes", {
        eventId: id,
        code: "OPEN-1",
        codeType: "Pro",
        claimKey: 0.2,
      });
      await ctx.db.insert("codes", {
        eventId: id,
        code: "OPEN-2",
        codeType: "Pro",
        claimKey: 0.6,
      });
      return id;
    });

    const sentinel = await t.run((ctx) => probeBlockCode(ctx, eventId, "Pro"));
    expect(sentinel?.code).toBe("OPEN-2");

    const first = await t
      .withIdentity(attendee(0))
      .mutation(api.claims.claim, { slug: "filtered-sentinel", name: "First" });
    expect(first).toMatchObject({ ok: true, code: "OPEN-1" });

    // Sentinel OPEN-2 is still available.
    expect(
      await t.query(api.events.getBySlug, { slug: "filtered-sentinel" })
    ).toMatchObject({ soldOut: false, codeTypes: ["Pro"] });

    // Second claim takes the last open code OPEN-2; event sells out for
    // anonymous viewers while VIP still sees their reserved code.
    const second = await t
      .withIdentity(attendee(1))
      .mutation(api.claims.claim, {
        slug: "filtered-sentinel",
        name: "Second",
      });
    expect(second).toMatchObject({ ok: true, code: "OPEN-2" });
    expect(
      await t.query(api.events.getBySlug, { slug: "filtered-sentinel" })
    ).toMatchObject({ soldOut: true, codeTypes: [] });
    expect(
      await t
        .withIdentity(vip)
        .query(api.events.getBySlug, { slug: "filtered-sentinel" })
    ).toMatchObject({ soldOut: false, codeTypes: ["Pro"] });
    expect(
      await t
        .withIdentity(vip)
        .mutation(api.claims.claim, { slug: "filtered-sentinel", name: "VIP" })
    ).toMatchObject({ ok: true, code: "RESERVED-TOP" });
  });

  test("codes.add deduplicates via by_event_code without missing duplicates", async () => {
    const { admin } = await setup();
    const event = await admin.mutation(api.events.create, {
      name: "Dedup Event",
      slug: "dedup-event",
    });
    expect(
      await admin.mutation(api.codes.add, {
        eventId: event.id,
        codes: ["A1", "A2", "A1", ""],
        codeType: "Pro",
      })
    ).toEqual({ added: 2, skipped: 2 });
    expect(
      await admin.mutation(api.codes.add, {
        eventId: event.id,
        codes: ["A2", "A3"],
        codeType: "Pro",
      })
    ).toEqual({ added: 1, skipped: 1 });
  });
});

describe("withClaimRetry", () => {
  test("retries transient errors and returns once a retry succeeds", async () => {
    let calls = 0;
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await withClaimRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("Documents read from or written to changed");
        return { ok: true as const, code: "PRO-1" };
      },
      { maxAttempts: 3, baseDelayMs: 50, random: () => 0.5, sleep }
    );
    expect(result).toEqual({ ok: true, code: "PRO-1" });
    expect(calls).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 75);
    expect(sleep).toHaveBeenNthCalledWith(2, 125);
  });

  test("never retries ConvexError application errors", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const run = vi.fn().mockRejectedValue(new ConvexError("Bad request"));
    await expect(withClaimRetry(run, { sleep })).rejects.toThrow("Bad request");
    expect(run).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  test("rethrows after exhausting maxAttempts", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const run = vi.fn().mockRejectedValue(new Error("transient conflict"));
    await expect(
      withClaimRetry(run, { maxAttempts: 2, sleep })
    ).rejects.toThrow("transient conflict");
    expect(run).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
