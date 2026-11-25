import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { canonicalIdentityKey } from "../lib/attendee-identity";

const modules = import.meta.glob("../convex/**/*.ts");
const adminIdentity = {
  subject: "admin",
  email: "admin@example.com",
  emailVerified: true,
};

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("admins", { email: adminIdentity.email }));
  const admin = t.withIdentity(adminIdentity);
  return { t, admin };
}

test("canonicalIdentityKey normalizes +tags, Gmail dots, and googlemail.com while preserving non-Gmail dots and X handles", () => {
  expect(canonicalIdentityKey("Alice.Smith+devin@GoogleMail.com")).toBe(
    "alicesmith@gmail.com"
  );
  expect(canonicalIdentityKey("a.l.i.c.e+1@gmail.com")).toBe("alice@gmail.com");
  expect(canonicalIdentityKey("alice+conf@fastmail.com")).toBe(
    "alice@fastmail.com"
  );
  expect(canonicalIdentityKey("alice.smith+conf@company.com")).toBe(
    "alice.smith@company.com"
  );
  expect(canonicalIdentityKey("alice.smith@company.com")).toBe(
    "alice.smith@company.com"
  );
  expect(canonicalIdentityKey("@Nader")).toBe("@nader");
});

test("blacklisting blocks already-listed attendees, releases reservations, and blocks access requests", async () => {
  const { t, admin } = await setup();
  const ev = await admin.mutation(api.events.create, {
    name: "List Event",
    slug: "list-ev",
  });
  await admin.mutation(api.codes.add, { eventId: ev.id, codes: ["CODE1"] });
  await admin.mutation(api.emails.add, {
    eventId: ev.id,
    emails: ["bad@example.com"],
  });
  // Reserve the code for the listed attendee before blacklisting.
  await t.run(async (ctx) => {
    const [code] = await ctx.db
      .query("codes")
      .withIndex("by_event", (q) => q.eq("eventId", ev.id))
      .collect();
    await ctx.db.patch(code._id, { reservedFor: "bad@example.com" });
  });

  const user = t.withIdentity({
    subject: "bad-user",
    email: "bad@example.com",
    emailVerified: true,
  });

  // Eligible before blacklist.
  expect(
    await user.query(api.claims.eligibility, { slug: "list-ev" })
  ).toMatchObject({ eligible: true });

  // Blacklist after they were already listed and had a reservation.
  await admin.mutation(api.blacklist.add, { email: "bad@example.com" });

  // Reservation is released back to the pool.
  const codes = await admin.query(api.codes.list, { eventId: ev.id });
  expect(codes[0].reservedFor).toBeUndefined();

  // Direct visits to the claim page and claim/waitlist mutations are blocked.
  expect(
    await user.query(api.claims.eligibility, { slug: "list-ev" })
  ).toMatchObject({ eligible: false, reason: "not_listed" });
  expect(await user.mutation(api.claims.claim, { slug: "list-ev" })).toMatchObject({
    ok: false,
  });
  expect(
    await user.mutation(api.waitlist.requestAccess, { slug: "list-ev" })
  ).toMatchObject({ ok: false });

  // Removing from blacklist restores eligibility on the list event.
  const [entry] = await admin.query(api.blacklist.list, {});
  await admin.mutation(api.blacklist.remove, { id: entry._id });
  expect(
    await user.query(api.claims.eligibility, { slug: "list-ev" })
  ).toMatchObject({ eligible: true });
});

test("blacklisting blocks dynamic-event attendees who already enrolled via instructions", async () => {
  const { t, admin } = await setup();
  const ev = await admin.mutation(api.events.create, {
    name: "Dyn Event",
    slug: "dyn-ev",
    dynamic: true,
    claimInstructions: "Read this first",
  });
  await admin.mutation(api.codes.add, { eventId: ev.id, codes: ["D1"] });

  const user = t.withIdentity({
    subject: "dyn-user",
    email: "dyn@gmail.com",
    emailVerified: true,
  });

  // Reading instructions enrolls the attendee in `emails`.
  await user.mutation(api.claims.markInstructionsRead, { slug: "dyn-ev" });

  // Admin blacklists them before they click claim.
  await admin.mutation(api.blacklist.add, { email: "dyn@gmail.com" });

  expect(
    await user.query(api.claims.eligibility, { slug: "dyn-ev" })
  ).toMatchObject({ eligible: false, reason: "not_listed" });
  expect(
    await user.mutation(api.claims.claim, {
      slug: "dyn-ev",
      name: "Dyn User",
      instructionsRead: true,
    })
  ).toMatchObject({ ok: false });
});

test("blacklist matches canonical email aliases for both legacy and new blacklist rows", async () => {
  const { t, admin } = await setup();
  const ev = await admin.mutation(api.events.create, {
    name: "Open Drop",
    slug: "open-drop",
    dynamic: true,
  });
  await admin.mutation(api.codes.add, { eventId: ev.id, codes: ["C1", "C2"] });

  // Legacy blacklist row without canonicalEmail.
  await t.run((ctx) =>
    ctx.db.insert("blacklistedEmails", { email: "abuser@gmail.com" })
  );
  const aliasUser = t.withIdentity({
    subject: "alias-1",
    email: "a.b.u.s.e.r+1@googlemail.com",
    emailVerified: true,
  });
  expect(
    await aliasUser.query(api.claims.eligibility, { slug: "open-drop" })
  ).toMatchObject({ eligible: false, reason: "not_listed" });
  expect(
    await aliasUser.mutation(api.claims.claim, {
      slug: "open-drop",
      name: "Alias",
    })
  ).toMatchObject({ ok: false });
  expect(
    await admin.mutation(api.emails.add, {
      eventId: ev.id,
      emails: ["a.b.u.s.e.r+2@gmail.com"],
    })
  ).toMatchObject({ added: 0, blacklisted: 1 });

  // New blacklist row added with a +tag also blocks the base address.
  await admin.mutation(api.blacklist.add, { email: "spammer+tag@gmail.com" });
  const baseUser = t.withIdentity({
    subject: "base-1",
    email: "spammer@gmail.com",
    emailVerified: true,
  });
  expect(
    await baseUser.mutation(api.claims.claim, {
      slug: "open-drop",
      name: "Spammer",
    })
  ).toMatchObject({ ok: false });
});

test("dynamic events refuse second claims via email aliases or same Clerk account", async () => {
  const { t, admin } = await setup();
  const ev = await admin.mutation(api.events.create, {
    name: "Workshop",
    slug: "workshop",
    dynamic: true,
  });
  await admin.mutation(api.codes.add, {
    eventId: ev.id,
    codes: ["W1", "W2", "W3"],
  });

  const first = t.withIdentity({
    subject: "clerk-1",
    email: "alice@gmail.com",
    emailVerified: true,
  });
  expect(
    await first.mutation(api.claims.claim, { slug: "workshop", name: "Alice" })
  ).toMatchObject({ ok: true, code: "W1" });

  // Different Clerk account with a +tag / dot alias of the same Gmail inbox.
  const alias = t.withIdentity({
    subject: "clerk-2",
    email: "a.l.i.c.e+2@googlemail.com",
    emailVerified: true,
  });
  const aliasAttempt = await alias.mutation(api.claims.claim, {
    slug: "workshop",
    name: "Alice 2",
  });
  expect(aliasAttempt.ok).toBe(false);
  if (!aliasAttempt.ok) {
    expect(aliasAttempt.error).toMatch(/already been claimed/);
  }
  // Alias attempt did not enroll an extra row in `emails`.
  const listed = await admin.query(api.emails.list, { eventId: ev.id });
  expect(listed.map((r) => r.email)).toEqual(["alice@gmail.com"]);

  // Same Clerk account with a different email cannot claim a second code here.
  const sameClerkDiffEmail = t.withIdentity({
    subject: "clerk-1",
    email: "alice-alt@other.com",
    emailVerified: true,
  });
  const accountAttempt = await sameClerkDiffEmail.mutation(api.claims.claim, {
    slug: "workshop",
    name: "Alice Alt",
  });
  expect(accountAttempt.ok).toBe(false);
  if (!accountAttempt.ok) {
    expect(accountAttempt.error).toMatch(/account has already claimed/);
  }
});

test("60-day cooldown enforces across email aliases and across email + X for the same Clerk account", async () => {
  const { t, admin } = await setup();
  const evA = await admin.mutation(api.events.create, {
    name: "Event A",
    slug: "ev-a",
    dynamic: true,
  });
  const evB = await admin.mutation(api.events.create, {
    name: "Event B",
    slug: "ev-b",
    dynamic: true,
  });
  const evC = await admin.mutation(api.events.create, {
    name: "Event C",
    slug: "ev-c",
    dynamic: true,
  });
  for (const ev of [evA, evB, evC]) {
    await admin.mutation(api.codes.add, {
      eventId: ev.id,
      codes: [`${ev.slug}-1`, `${ev.slug}-2`],
    });
  }

  // 1) Alias bypass test across 3 separate Clerk accounts sharing one Gmail inbox.
  const g1 = t.withIdentity({
    subject: "g1",
    email: "bob@gmail.com",
    emailVerified: true,
  });
  const g2 = t.withIdentity({
    subject: "g2",
    email: "b.o.b+conf@gmail.com",
    emailVerified: true,
  });
  const g3 = t.withIdentity({
    subject: "g3",
    email: "bob+third@googlemail.com",
    emailVerified: true,
  });

  expect(
    await g1.mutation(api.claims.claim, { slug: "ev-a", name: "Bob" })
  ).toMatchObject({ ok: true });
  expect(
    await g2.mutation(api.claims.claim, { slug: "ev-b", name: "Bob" })
  ).toMatchObject({ ok: true });

  expect(
    await g3.query(api.claims.eligibility, { slug: "ev-c" })
  ).toMatchObject({ eligible: true, cooldown: { recent: 2 } });
  const thirdAlias = await g3.mutation(api.claims.claim, {
    slug: "ev-c",
    name: "Bob",
  });
  expect(thirdAlias.ok).toBe(false);
  if (!thirdAlias.ok) {
    expect(thirdAlias.error).toMatch(/already claimed codes at 2 events/);
  }

  // Releasing one code clears canonical/userId fields so the cooldown lifts.
  const [evACode] = await admin.query(api.codes.list, { eventId: evA.id });
  await admin.mutation(api.codes.release, { id: evACode._id });
  expect(
    await g3.mutation(api.claims.claim, { slug: "ev-c", name: "Bob" })
  ).toMatchObject({ ok: true });

  // 2) Same Clerk user claiming across an email event and an X event.
  const evX = await admin.mutation(api.events.create, {
    name: "X Event",
    slug: "ev-x",
    dynamic: true,
    identity: "x",
  });
  await admin.mutation(api.codes.add, { eventId: evX.id, codes: ["X1"] });
  const evD = await admin.mutation(api.events.create, {
    name: "Event D",
    slug: "ev-d",
    dynamic: true,
  });
  await admin.mutation(api.codes.add, { eventId: evD.id, codes: ["D1"] });

  await t.run((ctx) =>
    ctx.db.insert("xAccounts", {
      clerkUserId: "multi-user",
      handle: "@carol",
      syncedAt: Date.now(),
    })
  );
  const carol = t.withIdentity({
    subject: "multi-user",
    email: "carol@example.com",
    emailVerified: true,
  });

  expect(
    await carol.mutation(api.claims.claim, { slug: "ev-a", name: "Carol" })
  ).toMatchObject({ ok: true });
  expect(
    await carol.mutation(api.claims.claim, { slug: "ev-x", name: "Carol" })
  ).toMatchObject({ ok: true });

  // Even if Carol switches her Clerk email, the same Clerk subject hits cooldown.
  const carolNewEmail = t.withIdentity({
    subject: "multi-user",
    email: "carol-new@different.org",
    emailVerified: true,
  });
  expect(
    await carolNewEmail.query(api.claims.eligibility, { slug: "ev-d" })
  ).toMatchObject({ eligible: true, cooldown: { recent: 2 } });
  expect(
    await carolNewEmail.mutation(api.claims.claim, {
      slug: "ev-d",
      name: "Carol",
    })
  ).toMatchObject({ ok: false });
});

test("uploading an email alias across events flags it for duplicate review", async () => {
  const { admin } = await setup();
  const ev1 = await admin.mutation(api.events.create, {
    name: "First",
    slug: "first",
  });
  const ev2 = await admin.mutation(api.events.create, {
    name: "Second",
    slug: "second",
  });
  await admin.mutation(api.emails.add, {
    eventId: ev1.id,
    emails: ["dave@gmail.com"],
  });
  const res = await admin.mutation(api.emails.add, {
    eventId: ev2.id,
    emails: ["d.a.v.e+meetup@googlemail.com"],
  });
  expect(res).toMatchObject({ added: 0, flagged: 1 });
  const flagged = await admin.query(api.emails.listFlagged, { eventId: ev2.id });
  expect(flagged.entries).toHaveLength(1);
  expect(flagged.entries[0]).toMatchObject({
    email: "d.a.v.e+meetup@googlemail.com",
    matchedEvents: [{ id: ev1.id, name: "First" }],
  });
});
