import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { xHandleFromClerkUser } from "../convex/xAccounts";
import {
  identityLabels,
  normalizeIdentityKey,
  normalizeXHandle,
} from "../lib/attendee-identity";
import { extractXHandles, fileToItems } from "../lib/spreadsheet";

const modules = import.meta.glob("../convex/**/*.ts");

const admin = { subject: "admin", email: "admin@example.com", emailVerified: true };
// An attendee who signed in with X; Clerk may or may not give us an email.
const alice = { subject: "user_alice", email: "alice@example.com", emailVerified: true };
const bob = { subject: "user_bob" };

async function setup({
  identity,
  dynamic = false,
  codes = ["A", "B"],
}: {
  identity: "email" | "x";
  dynamic?: boolean;
  codes?: string[];
}) {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("admins", { email: admin.email }));
  const asAdmin = t.withIdentity(admin);
  const event = await asAdmin.mutation(api.events.create, {
    name: "Meetup",
    slug: "meetup",
    identity,
    dynamic,
  });
  if (codes.length) {
    await asAdmin.mutation(api.codes.add, { eventId: event.id, codes });
  }
  const linkX = (clerkUserId: string, handle: string | undefined) =>
    t.mutation(internal.xAccounts.store, { clerkUserId, handle });
  return { t, asAdmin, event, linkX };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("normalizeXHandle accepts handles, @handles and profile URLs", () => {
  expect(normalizeXHandle("Devin_AI")).toBe("@devin_ai");
  expect(normalizeXHandle("  @Devin_AI ")).toBe("@devin_ai");
  expect(normalizeXHandle("https://x.com/Devin_AI?s=20")).toBe("@devin_ai");
  expect(normalizeXHandle("twitter.com/@devin_ai/")).toBe("@devin_ai");
  expect(normalizeXHandle("")).toBeNull();
  expect(normalizeXHandle("not a handle")).toBeNull();
  expect(normalizeXHandle("a".repeat(16))).toBeNull();
  expect(normalizeXHandle("user@example.com")).toBeNull();
  expect(normalizeIdentityKey("email", "  A@Example.com ")).toBe("a@example.com");
  expect(normalizeIdentityKey("email", "@handle")).toBeNull();
  expect(normalizeIdentityKey("x", "@handle")).toBe("@handle");
  expect(identityLabels("x").plural).toBe("handles");
});

test("spreadsheets yield handles from a handle column or scattered @mentions", async () => {
  expect(
    extractXHandles([
      ["Name", "X handle"],
      ["Alice", "@Alice"],
      ["Bob", "x.com/bobby"],
      ["Nobody", ""],
    ]),
  ).toEqual(["@alice", "@bobby"]);
  expect(
    extractXHandles([
      ["Alice (@Alice)", "seat 1"],
      ["mail alice@example.com", "@alice"],
      ["https://twitter.com/carol", "-"],
    ]),
  ).toEqual(["@alice", "@carol"]);
  // Only explicit handle headings select a column; "tax"/"index" don't, and
  // bare numbers in other columns never become handles.
  expect(
    extractXHandles([
      ["tax", "index", "name"],
      ["100", "1", "Alice"],
    ]),
  ).toEqual([]);
  expect(extractXHandles([["twitter_username"], ["Dana"]])).toEqual(["@dana"]);
  const csv = new File(["handle\n@one\n@two\n"], "list.csv", { type: "text/csv" });
  expect(await fileToItems(csv, "handles")).toEqual(["@one", "@two"]);
});

test("xHandleFromClerkUser only trusts a verified X external account", () => {
  const user = (accounts: unknown[]) => ({ external_accounts: accounts });
  expect(
    xHandleFromClerkUser(
      user([
        { provider: "oauth_google", username: "alice", verification: { status: "verified" } },
        { provider: "oauth_x", username: "Alice_X", verification: { status: "verified" } },
      ]),
    ),
  ).toBe("@alice_x");
  expect(
    xHandleFromClerkUser(
      user([{ provider: "oauth_twitter", username: "legacy", verification: { status: "verified" } }]),
    ),
  ).toBe("@legacy");
  expect(
    xHandleFromClerkUser(
      user([{ provider: "oauth_x", username: "unverified", verification: { status: "unverified" } }]),
    ),
  ).toBeNull();
  expect(xHandleFromClerkUser(user([{ provider: "oauth_x", verification: { status: "verified" } }]))).toBeNull();
  expect(xHandleFromClerkUser(null)).toBeNull();
  expect(xHandleFromClerkUser("nope")).toBeNull();
});

test("xAccounts.sync stores the handle Clerk reports and never one from the browser", async () => {
  const { t } = await setup({ identity: "x" });
  const user = t.withIdentity(alice);

  vi.stubEnv("CLERK_SECRET_KEY", "");
  expect(await user.action(api.xAccounts.sync, {})).toEqual({
    ok: false,
    reason: "not_configured",
  });

  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_secret");
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    expect(String(input)).toBe("https://api.clerk.com/v1/users/user_alice");
    return new Response(
      JSON.stringify({
        external_accounts: [
          { provider: "oauth_x", username: "Alice_X", verification: { status: "verified" } },
        ],
      }),
      { status: 200 },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  expect(await user.action(api.xAccounts.sync, {})).toEqual({ ok: true, handle: "@alice_x" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(await user.query(api.xAccounts.mine, {})).toEqual({ handle: "@alice_x" });

  // Clerk stops reporting an X account (unlinked): the mapping is dropped.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ external_accounts: [] }), { status: 200 })),
  );
  expect(await user.action(api.xAccounts.sync, {})).toEqual({ ok: true, handle: null });
  expect(await user.query(api.xAccounts.mine, {})).toEqual({ handle: null });

  vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
  expect(await user.action(api.xAccounts.sync, {})).toEqual({ ok: false, reason: "lookup_failed" });

  expect(await t.action(api.xAccounts.sync, {})).toEqual({ ok: false, reason: "unauthenticated" });
});

test("X events key eligibility and claims on the synced handle, not the email", async () => {
  const { t, asAdmin, event, linkX } = await setup({ identity: "x" });
  await asAdmin.mutation(api.emails.add, {
    eventId: event.id,
    emails: ["@Alice_X", "https://x.com/bobby", "alice@example.com", "@Alice_X"],
  });
  expect(
    (await asAdmin.query(api.emails.list, { eventId: event.id })).map((e) => e.email).sort(),
  ).toEqual(["@alice_x", "@bobby"]);

  const user = t.withIdentity(alice);
  // Signed in (even with a verified email) but no X account synced yet.
  expect(await user.query(api.claims.eligibility, { slug: "meetup" })).toEqual({
    eligible: false,
    reason: "no_x_account",
  });
  expect(await user.mutation(api.claims.claim, { slug: "meetup" })).toMatchObject({ ok: false });

  await linkX(alice.subject, "@alice_x");
  expect(await user.query(api.claims.eligibility, { slug: "meetup" })).toMatchObject({
    eligible: true,
    identity: "@alice_x",
  });
  expect(await user.query(api.events.getBySlug, { slug: "meetup" })).toMatchObject({
    identity: "x",
  });
  expect(await user.mutation(api.claims.claim, { slug: "meetup" })).toMatchObject({
    ok: true,
    code: "A",
  });
  expect(await user.mutation(api.claims.claim, { slug: "meetup" })).toMatchObject({
    ok: true,
    code: "A",
    alreadyClaimed: true,
  });
  await t.run(async (ctx) => {
    const codes = await ctx.db
      .query("codes")
      .withIndex("by_event", (q) => q.eq("eventId", event.id))
      .collect();
    expect(codes.find((c) => c.code === "A")?.claimedBy).toBe("@alice_x");
  });

  // The claim shows up under the viewer's events and codes.
  expect(await user.query(api.events.mine, {})).toMatchObject([{ slug: "meetup", claimed: true }]);
  expect(await user.query(api.codes.mine, {})).toMatchObject([{ code: "A" }]);

  // Another signed-in user whose handle isn't listed.
  await linkX(bob.subject, "@someone_else");
  expect(await t.withIdentity(bob).query(api.claims.eligibility, { slug: "meetup" })).toMatchObject({
    eligible: false,
    reason: "not_listed",
  });
});

test("event admins can preview an X event without an X account", async () => {
  const { asAdmin } = await setup({ identity: "x" });
  expect(
    await asAdmin.query(api.claims.eligibility, { slug: "meetup", preview: true }),
  ).toMatchObject({ eligible: true, preview: true });
});

test("dynamic X events give one code per handle and record it", async () => {
  const { t, event, linkX } = await setup({ identity: "x", dynamic: true });
  const user = t.withIdentity(bob);
  expect(await user.query(api.claims.eligibility, { slug: "meetup" })).toEqual({
    eligible: false,
    reason: "no_x_account",
  });
  await linkX(bob.subject, "@bobby");
  expect(await user.mutation(api.claims.claim, { slug: "meetup" })).toMatchObject({
    ok: true,
    code: "A",
  });
  expect(await user.mutation(api.claims.claim, { slug: "meetup" })).toMatchObject({
    ok: true,
    code: "A",
    alreadyClaimed: true,
  });
  await t.run(async (ctx) => {
    const participants = await ctx.db
      .query("emails")
      .withIndex("by_event", (q) => q.eq("eventId", event.id))
      .collect();
    expect(participants.map((p) => p.email)).toEqual(["@bobby"]);
  });
});

test("a re-linked or renamed handle keeps the earlier claim with the old key", async () => {
  const { t, asAdmin, event, linkX } = await setup({ identity: "x" });
  await asAdmin.mutation(api.emails.add, { eventId: event.id, emails: ["@old_name", "@new_name"] });
  const user = t.withIdentity(alice);
  await linkX(alice.subject, "@old_name");
  expect(await user.mutation(api.claims.claim, { slug: "meetup" })).toMatchObject({ ok: true, code: "A" });

  // Same Clerk user, handle changed on X and re-synced: a fresh identity for
  // this event, so the list decides whether they can claim again.
  await linkX(alice.subject, "@new_name");
  expect(await user.query(api.xAccounts.mine, {})).toEqual({ handle: "@new_name" });
  expect(await user.mutation(api.claims.claim, { slug: "meetup" })).toMatchObject({ ok: true, code: "B" });

  // A different Clerk user linking the same X account takes the mapping over.
  await linkX(bob.subject, "@new_name");
  expect(await user.query(api.xAccounts.mine, {})).toEqual({ handle: null });
  expect(await t.withIdentity(bob).query(api.claims.eligibility, { slug: "meetup" })).toMatchObject({
    eligible: true,
    identity: "@new_name",
    claimed: { code: "B" },
  });
});

test("email events ignore a synced X handle and keep working for legacy rows", async () => {
  const { t, asAdmin, event, linkX } = await setup({ identity: "email" });
  await t.run((ctx) => ctx.db.patch(event.id, { identity: undefined }));
  await asAdmin.mutation(api.emails.add, { eventId: event.id, emails: ["Alice@Example.com", "@alice_x"] });
  expect(
    (await asAdmin.query(api.emails.list, { eventId: event.id })).map((e) => e.email),
  ).toEqual(["alice@example.com"]);
  await linkX(alice.subject, "@alice_x");
  const user = t.withIdentity(alice);
  expect(await user.query(api.events.getBySlug, { slug: "meetup" })).toMatchObject({ identity: "email" });
  expect(await user.query(api.claims.eligibility, { slug: "meetup" })).toMatchObject({
    eligible: true,
    identity: "alice@example.com",
  });
  expect(await user.mutation(api.claims.claim, { slug: "meetup" })).toMatchObject({ ok: true, code: "A" });
  await t.run(async (ctx) => {
    const codes = await ctx.db
      .query("codes")
      .withIndex("by_event", (q) => q.eq("eventId", event.id))
      .collect();
    expect(codes.find((c) => c.code === "A")?.claimedBy).toBe("alice@example.com");
  });
  // Unverified email on an email event is still rejected.
  expect(
    await t.withIdentity({ ...alice, emailVerified: false }).query(api.claims.eligibility, { slug: "meetup" }),
  ).toEqual({ eligible: false, reason: "unverified" });
});

test("the identity mode can only change while the event has no participants or claims", async () => {
  const { t, asAdmin, event } = await setup({ identity: "email", codes: [] });
  const base = { id: event.id, name: "Meetup", slug: "meetup" };
  await asAdmin.mutation(api.events.update, { ...base, identity: "x" });
  expect(await asAdmin.query(api.events.get, { id: event.id })).toMatchObject({ identity: "x" });
  await asAdmin.mutation(api.emails.add, { eventId: event.id, emails: ["@alice_x"] });
  await expect(
    asAdmin.mutation(api.events.update, { ...base, identity: "email" }),
  ).rejects.toThrow(/before changing how attendees are identified/);
  // Omitting identity (older admin forms) leaves it untouched.
  await asAdmin.mutation(api.events.update, { ...base, name: "Renamed" });
  expect(await asAdmin.query(api.events.get, { id: event.id })).toMatchObject({
    name: "Renamed",
    identity: "x",
  });
  await asAdmin.mutation(api.emails.removeAll, { eventId: event.id });
  await asAdmin.mutation(api.events.update, { ...base, identity: "email" });
  expect(await asAdmin.query(api.events.get, { id: event.id })).toMatchObject({ identity: "email" });
  // Pending flagged entries and access requests are keyed too, so they block
  // the change until resolved.
  const flagId = await t.run((ctx) =>
    ctx.db.insert("flaggedEmails", { eventId: event.id, email: "alice@example.com", matchedEventIds: [] }),
  );
  await expect(asAdmin.mutation(api.events.update, { ...base, identity: "x" })).rejects.toThrow(
    /before changing how attendees are identified/,
  );
  await t.run((ctx) => ctx.db.delete(flagId));
  const requestId = await t.run((ctx) =>
    ctx.db.insert("accessRequests", { eventId: event.id, email: "alice@example.com", status: "pending" }),
  );
  await expect(asAdmin.mutation(api.events.update, { ...base, identity: "x" })).rejects.toThrow(
    /before changing how attendees are identified/,
  );
  // A denied request must not lock the mode, but it is still approvable, so
  // the change retires it rather than leaving an email key on an X event.
  await t.run((ctx) => ctx.db.patch(requestId, { status: "denied" }));
  await asAdmin.mutation(api.events.update, { ...base, identity: "x" });
  expect(await asAdmin.query(api.events.get, { id: event.id })).toMatchObject({ identity: "x" });
  expect(await t.run((ctx) => ctx.db.get(requestId))).toBeNull();
});

test("the blacklist accepts @handles and blocks them from X events", async () => {
  const { t, asAdmin, event, linkX } = await setup({ identity: "x", dynamic: true });
  await asAdmin.mutation(api.blacklist.add, { email: "@Bad_Actor" });
  await expect(asAdmin.mutation(api.blacklist.add, { email: "@not valid" })).rejects.toThrow();
  expect(
    await asAdmin.mutation(api.emails.add, { eventId: event.id, emails: ["@bad_actor"] }),
  ).toMatchObject({ added: 0, blacklisted: 1 });
  await linkX(bob.subject, "@bad_actor");
  expect(await t.withIdentity(bob).query(api.claims.eligibility, { slug: "meetup" })).toMatchObject({
    eligible: false,
    reason: "not_listed",
  });
});
