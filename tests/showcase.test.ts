import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

const admin = { subject: "admin", email: "admin@example.com", emailVerified: true };
const alice = { subject: "alice", email: "alice@example.com", emailVerified: true };
const bob = { subject: "bob", email: "bob@example.com", emailVerified: true };
const carol = { subject: "carol", email: "carol@example.com", emailVerified: true };
const stranger = { subject: "zed", email: "zed@example.com", emailVerified: true };

async function setup(open = true) {
  const t = convexTest(schema, modules);
  const eventId = await t.run(async (ctx) => {
    await ctx.db.insert("admins", { email: admin.email });
    const eventId = await ctx.db.insert("events", {
      name: "Hack Night",
      slug: "hack-night",
      showcaseOpen: open || undefined,
    });
    // Alice is whitelisted; Bob only holds a claimed code; Carol is both.
    await ctx.db.insert("emails", { eventId, email: alice.email });
    await ctx.db.insert("codes", { eventId, code: "B1", claimedBy: bob.email });
    await ctx.db.insert("emails", { eventId, email: carol.email });
    return eventId;
  });
  return { t, eventId };
}

test("attendees submit one entry each and can edit it", async () => {
  const { t } = await setup();
  const a = t.withIdentity(alice);
  const first = await a.mutation(api.showcase.submit, {
    slug: "hack-night",
    title: "  Robot DJ  ",
    url: "github.com/alice/robot-dj",
  });
  expect(first.updated).toBe(false);
  const second = await a.mutation(api.showcase.submit, {
    slug: "hack-night",
    title: "Robot DJ v2",
  });
  expect(second).toEqual({ entryId: first.entryId, updated: true });

  const board = await a.query(api.showcase.board, { slug: "hack-night" });
  expect(board?.entries).toHaveLength(1);
  expect(board?.entries[0]).toMatchObject({
    title: "Robot DJ v2",
    mine: true,
    voteCount: 0,
    rank: 1,
  });
  expect(board?.entries[0].email).toBeUndefined();
  // The url was normalized on the first submit and cleared on the second.
  expect(board?.entries[0].url).toBeUndefined();
});

test("only attendees of an open showcase may submit", async () => {
  const { t } = await setup();
  await expect(
    t.mutation(api.showcase.submit, { slug: "hack-night", title: "Anon" }),
  ).rejects.toThrow(/sign in/i);
  await expect(
    t.withIdentity(stranger).mutation(api.showcase.submit, {
      slug: "hack-night",
      title: "Gatecrasher",
    }),
  ).rejects.toThrow(/only attendees/i);
  await expect(
    t.withIdentity(alice).mutation(api.showcase.submit, {
      slug: "hack-night",
      title: "Bad link",
      url: "javascript:alert(1)",
    }),
  ).rejects.toThrow(/link/i);

  const { t: closed } = await setup(false);
  await expect(
    closed.withIdentity(alice).mutation(api.showcase.submit, {
      slug: "hack-night",
      title: "Too early",
    }),
  ).rejects.toThrow(/isn't open/i);
});

test("votes are capped, toggle off, exclude own entry, and rank the board", async () => {
  const { t } = await setup();
  const a = t.withIdentity(alice);
  const b = t.withIdentity(bob);
  const c = t.withIdentity(carol);
  const { entryId: aliceEntry } = await a.mutation(api.showcase.submit, {
    slug: "hack-night",
    title: "Alice",
  });
  const { entryId: bobEntry } = await b.mutation(api.showcase.submit, {
    slug: "hack-night",
    title: "Bob",
  });
  const { entryId: carolEntry } = await c.mutation(api.showcase.submit, {
    slug: "hack-night",
    title: "Carol",
  });

  await expect(
    a.mutation(api.showcase.toggleVote, { slug: "hack-night", entryId: aliceEntry }),
  ).rejects.toThrow(/own project/i);

  expect(
    await a.mutation(api.showcase.toggleVote, { slug: "hack-night", entryId: bobEntry }),
  ).toEqual({ voted: true });
  await c.mutation(api.showcase.toggleVote, { slug: "hack-night", entryId: bobEntry });
  await b.mutation(api.showcase.toggleVote, { slug: "hack-night", entryId: carolEntry });

  let board = await a.query(api.showcase.board, { slug: "hack-night" });
  expect(board?.entries.map((e) => [e.title, e.voteCount, e.rank])).toEqual([
    ["Bob", 2, 1],
    ["Carol", 1, 2],
    ["Alice", 0, 3],
  ]);
  expect(board?.votesRemaining).toBe(2);
  expect(board?.entries.find((e) => e.title === "Bob")?.voted).toBe(true);

  // Toggling again retracts the vote.
  expect(
    await a.mutation(api.showcase.toggleVote, { slug: "hack-night", entryId: bobEntry }),
  ).toEqual({ voted: false });
  board = await a.query(api.showcase.board, { slug: "hack-night" });
  expect(board?.votesRemaining).toBe(3);
  expect(board?.entries[0]).toMatchObject({ title: "Bob", voteCount: 1 });

  // Cap: a fourth distinct vote is refused.
  const extra = await t.run(async (ctx) => {
    const eventId = (await ctx.db.query("events").first())!._id;
    return Promise.all(
      ["d", "e"].map((n) =>
        ctx.db.insert("showcaseEntries", {
          eventId,
          email: `${n}@example.com`,
          title: n,
          voteCount: 0,
        }),
      ),
    );
  });
  await a.mutation(api.showcase.toggleVote, { slug: "hack-night", entryId: bobEntry });
  await a.mutation(api.showcase.toggleVote, { slug: "hack-night", entryId: carolEntry });
  await a.mutation(api.showcase.toggleVote, { slug: "hack-night", entryId: extra[0] });
  await expect(
    a.mutation(api.showcase.toggleVote, { slug: "hack-night", entryId: extra[1] }),
  ).rejects.toThrow(/all 3 votes/i);

  // Strangers and signed-out visitors can watch but not vote.
  await expect(
    t.withIdentity(stranger).mutation(api.showcase.toggleVote, {
      slug: "hack-night",
      entryId: bobEntry,
    }),
  ).rejects.toThrow(/only attendees/i);
  const publicBoard = await t.query(api.showcase.board, { slug: "hack-night" });
  expect(publicBoard).toMatchObject({
    signedIn: false,
    canParticipate: false,
    viewerIsAdmin: false,
  });
  expect(publicBoard?.entries.every((e) => e.email === undefined)).toBe(true);
});

test("admins open/close the showcase, see emails, and moderate entries", async () => {
  const { t, eventId } = await setup(false);
  const a = t.withIdentity(alice);
  const adm = t.withIdentity(admin);

  await expect(
    a.mutation(api.showcase.setOpen, { eventId, open: true }),
  ).rejects.toThrow();
  await adm.mutation(api.showcase.setOpen, { eventId, open: true });
  expect(
    (await t.query(api.events.getBySlug, { slug: "hack-night" }))?.showcaseOpen,
  ).toBe(true);

  const { entryId } = await a.mutation(api.showcase.submit, {
    slug: "hack-night",
    title: "Alice",
  });
  await t
    .withIdentity(bob)
    .mutation(api.showcase.toggleVote, { slug: "hack-night", entryId });

  const board = await adm.query(api.showcase.board, { slug: "hack-night" });
  expect(board?.viewerIsAdmin).toBe(true);
  expect(board?.entries[0].email).toBe(alice.email);

  await expect(
    t.withIdentity(bob).mutation(api.showcase.remove, { entryId }),
  ).rejects.toThrow();
  await adm.mutation(api.showcase.remove, { entryId });
  const votes = await t.run((ctx) => ctx.db.query("showcaseVotes").collect());
  expect(votes).toHaveLength(0);
  expect(
    (await t.query(api.showcase.board, { slug: "hack-night" }))?.entries,
  ).toEqual([]);

  // Closing freezes submissions and withdrawals but the board remains
  // readable; admins can still moderate.
  const { entryId: finalEntry } = await a.mutation(api.showcase.submit, {
    slug: "hack-night",
    title: "Final",
  });
  await adm.mutation(api.showcase.setOpen, { eventId, open: false });
  await expect(
    a.mutation(api.showcase.submit, { slug: "hack-night", title: "Late" }),
  ).rejects.toThrow(/isn't open/i);
  await expect(
    a.mutation(api.showcase.remove, { entryId: finalEntry }),
  ).rejects.toThrow(/closed/i);
  expect(
    (await t.query(api.showcase.board, { slug: "hack-night" }))?.entries,
  ).toHaveLength(1);
  await adm.mutation(api.showcase.remove, { entryId: finalEntry });
  expect(
    (await t.query(api.showcase.board, { slug: "hack-night" }))?.event.showcaseOpen,
  ).toBe(false);
});

test("deleting an event removes its showcase data", async () => {
  const { t, eventId } = await setup();
  const { entryId } = await t
    .withIdentity(alice)
    .mutation(api.showcase.submit, { slug: "hack-night", title: "Alice" });
  await t
    .withIdentity(bob)
    .mutation(api.showcase.toggleVote, { slug: "hack-night", entryId });
  await t.withIdentity(admin).mutation(api.events.remove, { id: eventId });
  const [entries, votes] = await t.run((ctx) =>
    Promise.all([
      ctx.db.query("showcaseEntries").collect(),
      ctx.db.query("showcaseVotes").collect(),
    ]),
  );
  expect(entries).toEqual([]);
  expect(votes).toEqual([]);
});
