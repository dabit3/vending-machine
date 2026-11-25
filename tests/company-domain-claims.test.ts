import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import {
  emailDomain,
  formatAllowedDomains,
  isPublicEmailDomain,
  matchesAllowedDomain,
  normalizeDomain,
  parseAllowedDomains,
} from "../lib/allowed-domains";

const modules = import.meta.glob("../convex/**/*.ts");

const adminIdentity = {
  subject: "admin-1",
  email: "admin@cognition.ai",
  emailVerified: true,
};

const acmeAlice = {
  subject: "alice",
  email: "Alice@Acme.com",
  emailVerified: true,
};

const acmeBob = {
  subject: "bob",
  email: "bob@acme.io",
  emailVerified: true,
};

const personalUser = {
  subject: "personal",
  email: "alice@gmail.com",
  emailVerified: true,
};

const subdomainUser = {
  subject: "sub",
  email: "alice@sub.acme.com",
  emailVerified: true,
};

async function setupAdmin() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("admins", { email: "admin@cognition.ai" });
  });
  return { t, admin: t.withIdentity(adminIdentity) };
}

test("domain normalization, parsing, matching, and formatting", () => {
  expect(normalizeDomain("  Acme.COM  ")).toBe("acme.com");
  expect(normalizeDomain("@acme.com")).toBe("acme.com");
  expect(normalizeDomain("https://Acme.com/")).toBe("acme.com");
  expect(normalizeDomain("sub.acme.co.uk")).toBe("sub.acme.co.uk");
  expect(normalizeDomain("alice@acme.com")).toBeNull();
  expect(normalizeDomain("localhost")).toBeNull();
  expect(normalizeDomain("-bad.com")).toBeNull();
  expect(normalizeDomain("")).toBeNull();

  expect(parseAllowedDomains("Acme.com, @acme.io\nacme.com  bad@email.com")).toEqual({
    domains: ["acme.com", "acme.io"],
    invalid: ["bad@email.com"],
  });

  expect(emailDomain("Alice@Acme.com")).toBe("acme.com");
  expect(emailDomain("@handle")).toBeNull();

  expect(matchesAllowedDomain("alice@acme.com", ["acme.com"])).toBe(true);
  expect(matchesAllowedDomain("alice@sub.acme.com", ["acme.com"])).toBe(false);
  expect(matchesAllowedDomain("alice@gmail.com", ["acme.com"])).toBe(false);
  expect(matchesAllowedDomain("alice@acme.com", undefined)).toBe(false);

  expect(isPublicEmailDomain("gmail.com")).toBe(true);
  expect(isPublicEmailDomain("acme.com")).toBe(false);

  expect(formatAllowedDomains(["acme.com"])).toBe("@acme.com");
  expect(formatAllowedDomains(["acme.com", "acme.io"])).toBe("@acme.com or @acme.io");
  expect(formatAllowedDomains(["a.com", "b.com", "c.com"])).toBe("@a.com, @b.com, or @c.com");
});

test("company domain events allow matching work emails and reject other domains", async () => {
  const { t, admin } = await setupAdmin();
  const { id: eventId, slug } = await admin.mutation(api.events.create, {
    name: "Acme Corp",
    allowedDomains: ["@Acme.com", "acme.io"],
    codeBlocks: [{ codes: ["ACME-1", "ACME-2"] }],
  });

  const publicEvent = await t.query(api.events.getBySlug, { slug });
  expect(publicEvent).toMatchObject({
    dynamic: false,
    allowedDomains: ["acme.com", "acme.io"],
  });

  const alice = t.withIdentity(acmeAlice);
  const bob = t.withIdentity(acmeBob);
  const personal = t.withIdentity(personalUser);
  const sub = t.withIdentity(subdomainUser);

  // Matching domains are eligible without being pre-uploaded.
  expect(await alice.query(api.claims.eligibility, { slug })).toMatchObject({
    eligible: true,
    identity: "alice@acme.com",
  });
  expect(await bob.query(api.claims.eligibility, { slug })).toMatchObject({
    eligible: true,
    identity: "bob@acme.io",
  });

  // Personal emails and non-listed subdomains get wrong_domain.
  expect(await personal.query(api.claims.eligibility, { slug })).toMatchObject({
    eligible: false,
    reason: "wrong_domain",
    identity: "alice@gmail.com",
    allowedDomains: ["acme.com", "acme.io"],
  });
  expect(await sub.query(api.claims.eligibility, { slug })).toMatchObject({
    eligible: false,
    reason: "wrong_domain",
  });

  // Personal email cannot claim or request waitlist access.
  expect(
    await personal.mutation(api.claims.claim, { slug, name: "Alice" })
  ).toMatchObject({
    ok: false,
    error: expect.stringContaining("@acme.com or @acme.io"),
  });
  expect(
    await personal.mutation(api.waitlist.requestAccess, { slug })
  ).toMatchObject({
    ok: false,
    error: expect.stringContaining("@acme.com or @acme.io"),
  });

  // Name is required for self-enrolling company domain claims.
  expect(await alice.mutation(api.claims.claim, { slug })).toMatchObject({
    ok: false,
    error: "Enter your name to claim your code.",
  });

  // Alice and Bob each claim one code and are recorded in emails.
  const first = await alice.mutation(api.claims.claim, { slug, name: "Alice Smith" });
  expect(first).toMatchObject({ ok: true, alreadyClaimed: false });
  const second = await alice.mutation(api.claims.claim, { slug, name: "Alice Smith" });
  expect(second).toMatchObject({ ok: true, alreadyClaimed: true, code: first.ok ? first.code : "" });

  const bobClaim = await bob.mutation(api.claims.claim, { slug, name: "Bob Jones" });
  expect(bobClaim).toMatchObject({ ok: true, alreadyClaimed: false });
  if (first.ok && bobClaim.ok) {
    expect(bobClaim.code).not.toBe(first.code);
  }

  const participants = await admin.query(api.emails.list, { eventId });
  expect(participants.map((p) => p.email).sort()).toEqual([
    "alice@acme.com",
    "bob@acme.io",
  ]);
});

test("company domain events enforce blacklist, instructions, and code release cleanup", async () => {
  const { t, admin } = await setupAdmin();
  const { id: eventId, slug } = await admin.mutation(api.events.create, {
    name: "Acme Corp",
    allowedDomains: ["acme.com"],
    claimInstructions: "Redeem on trydevin.ai.",
    codeBlocks: [{ codes: ["ACME-1"] }],
  });

  const alice = t.withIdentity(acmeAlice);

  // Instructions gate works on domain-restricted events.
  expect(
    await alice.mutation(api.claims.claim, { slug, name: "Alice" })
  ).toMatchObject({
    ok: false,
    error: "Read the redemption instructions before claiming your code.",
  });
  await alice.mutation(api.claims.markInstructionsRead, { slug });
  expect(await alice.query(api.claims.eligibility, { slug })).toMatchObject({
    eligible: true,
    instructionsViewed: true,
  });

  // Blacklisting blocks even an employee on an allowed domain who already read instructions.
  await admin.mutation(api.blacklist.add, { email: "alice@acme.com" });
  expect(await alice.query(api.claims.eligibility, { slug })).toMatchObject({
    eligible: false,
    reason: "not_listed",
  });
  expect(
    await alice.mutation(api.claims.claim, { slug, name: "Alice" })
  ).toMatchObject({ ok: false });

  // Unblacklisting lets her claim; releasing her code removes her auto-enrolled email row.
  const bl = await admin.query(api.blacklist.list, {});
  await admin.mutation(api.blacklist.remove, { id: bl[0]._id });
  const claimed = await alice.mutation(api.claims.claim, { slug, name: "Alice" });
  expect(claimed).toMatchObject({ ok: true, code: "ACME-1" });

  const codes = await admin.query(api.codes.list, { eventId });
  await admin.mutation(api.codes.release, { id: codes[0]._id });
  expect(await admin.query(api.emails.list, { eventId })).toEqual([]);
});

test("admin create/update validates allowedDomains and rejects X-handle combinations", async () => {
  const { admin } = await setupAdmin();

  await expect(
    admin.mutation(api.events.create, {
      name: "Bad Domain",
      allowedDomains: ["alice@acme.com"],
    })
  ).rejects.toThrow(/valid email domains/i);

  await expect(
    admin.mutation(api.events.create, {
      name: "X With Domain",
      identity: "x",
      allowedDomains: ["acme.com"],
    })
  ).rejects.toThrow(/email-identified events/i);

  const { id, slug } = await admin.mutation(api.events.create, {
    name: "Acme",
    allowedDomains: ["acme.com"],
  });

  // Updating allowedDomains works and clearing with [] returns to participant list mode.
  await admin.mutation(api.events.update, {
    id,
    name: "Acme",
    slug,
    allowedDomains: ["acme.com", "acme.dev"],
  });
  const updated = await admin.query(api.events.get, { id });
  expect(updated?.allowedDomains).toEqual(["acme.com", "acme.dev"]);
  expect(updated?.dynamic).toBeUndefined();

  await admin.mutation(api.events.update, {
    id,
    name: "Acme",
    slug,
    allowedDomains: [],
  });
  const cleared = await admin.query(api.events.get, { id });
  expect(cleared?.allowedDomains).toBeUndefined();
  expect(cleared?.dynamic).toBeUndefined();
});
