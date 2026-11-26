import { expect, test } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  removeEmailOptimistic,
  removeUnclaimedEmailsOptimistic,
  setCooldownOptimistic,
  removeTypeOptimistic,
  renameTypeOptimistic,
  removeCodeOptimistic,
  releaseCodeOptimistic,
  addBlacklistOptimistic,
  approveFlaggedOptimistic,
  rejectFlaggedOptimistic,
  isOptimisticId,
} from "../lib/admin-optimistic";

test("only fabricated optimistic IDs disable row actions", () => {
  expect(isOptimisticId("optimistic:person@example.com")).toBe(true);
  expect(isOptimisticId("optimistic:flagged-id")).toBe(true);
  expect(isOptimisticId("persisted-id")).toBe(false);
  expect(isOptimisticId("")).toBe(false);
  expect(isOptimisticId(undefined)).toBe(false);
});

function fakeStore() {
  const queries = new Map<string, { args: Record<string, unknown>; value: unknown }>();
  const key = (query: FunctionReference<"query">, args: unknown) => `${getFunctionName(query)}:${JSON.stringify(args)}`;
  return {
    getQuery: (query, args) => queries.get(key(query, args))?.value,
    setQuery: (query, args, value) => { queries.set(key(query, args), { args, value }); },
    getAllQueries: (query) => [...queries].filter(([name]) => name.startsWith(`${getFunctionName(query)}:`)).map(([, value]) => value),
  } as OptimisticLocalStore;
}

const eventId = "event" as Id<"events">;
const otherEventId = "other" as Id<"events">;
const emailId = "email" as Id<"emails">;
const codeId = "code" as Id<"codes">;
const email = { _id: emailId, _creationTime: 1, eventId, email: "a@example.com" };
const code = { _id: codeId, _creationTime: 1, eventId, code: "CODE", codeType: "Pro" };

test("removing an email updates the list, reservations and loaded cooldown pages without mutating the input", () => {
  const store = fakeStore();
  const rows = [email];
  const pageArgs = { eventId, paginationOpts: { numItems: 10, cursor: null } };
  store.setQuery(api.emails.list, { eventId }, rows);
  store.setQuery(api.emails.list, { eventId: otherEventId }, [{ ...email, _id: "other-email" as Id<"emails"> }]);
  store.setQuery(api.codes.list, { eventId }, [{ ...code, reservedFor: email.email }]);
  store.setQuery(api.emails.listCooldowns, pageArgs, { page: [{ id: emailId, email: email.email, recent: 2, waived: false }], isDone: true, continueCursor: "end" });
  removeEmailOptimistic(store, { id: emailId });
  expect(store.getQuery(api.emails.list, { eventId })).toEqual([]);
  expect(store.getQuery(api.emails.list, { eventId: otherEventId })).toHaveLength(1);
  expect(store.getQuery(api.codes.list, { eventId })?.[0].reservedFor).toBeUndefined();
  expect(store.getQuery(api.emails.listCooldowns, pageArgs)).toEqual({ page: [], isDone: true, continueCursor: "end" });
  expect(rows).toEqual([email]);
});

test("missing and empty caches are safe, and unknown claim data is not guessed", () => {
  const store = fakeStore();
  expect(() => removeEmailOptimistic(store, { id: emailId })).not.toThrow();
  store.setQuery(api.emails.list, { eventId }, [email]);
  removeUnclaimedEmailsOptimistic(store, { eventId });
  expect(store.getQuery(api.emails.list, { eventId })).toEqual([email]);
  store.setQuery(api.emails.list, { eventId }, []);
  removeEmailOptimistic(store, { id: emailId });
  expect(store.getQuery(api.emails.list, { eventId })).toEqual([]);
});

test("cooldown toggles update every loaded page while preserving pagination metadata", () => {
  const store = fakeStore();
  const args = { eventId, paginationOpts: { numItems: 10, cursor: "next" } };
  store.setQuery(api.emails.listCooldowns, args, { page: [{ id: emailId, email: email.email, recent: 2, eligibleAt: 123, waived: false }], isDone: false, continueCursor: "end" });
  setCooldownOptimistic(store, { id: emailId, waived: true });
  expect(store.getQuery(api.emails.listCooldowns, args)).toMatchObject({ page: [{ waived: true }], continueCursor: "end", isDone: false });
});

test("removing a block keeps claimed codes and their value, and rename moves Unicode storage keys", () => {
  const store = fakeStore();
  store.setQuery(api.events.get, { id: eventId }, {
    _id: eventId, _creationTime: 1, name: "Event", slug: "event",
    codeTypes: ["Pro"], codeTypeValues: { Pro: "$20" },
    description: undefined, adminNote: undefined, creditAmount: undefined, archivedCodeTypes: undefined,
    stripeArchiveSync: undefined, stripeRedemptionSync: undefined, eventDate: undefined, eventEndDate: undefined,
    claimInstructions: undefined, dynamic: undefined, allowedDomains: undefined, walkUpSkipsReview: undefined,
    claimMode: undefined, identity: "email", signInMessage: undefined,
    claimMessage: undefined, contactEmail: undefined, createdBy: undefined, archivedAt: undefined,
  });
  store.setQuery(api.codes.list, { eventId }, [code, { ...code, _id: "claimed" as Id<"codes">, claimedBy: email.email }]);
  removeTypeOptimistic(store, { eventId, codeType: "Pro" });
  expect(store.getQuery(api.codes.list, { eventId })).toHaveLength(1);
  expect(store.getQuery(api.events.get, { id: eventId })?.codeTypeValues).toEqual({ Pro: "$20" });
  renameTypeOptimistic(store, { eventId, from: "Pro", to: "日本" });
  expect(store.getQuery(api.codes.list, { eventId })?.[0].codeType).toBe("日本");
  expect(Object.values(store.getQuery(api.events.get, { id: eventId })?.codeTypeValues ?? {})).toEqual(["$20"]);
  expect(Object.keys(store.getQuery(api.events.get, { id: eventId })?.codeTypeValues ?? {})[0]).toMatch(/^[\x20-\x7e]+$/);
});

test("a stale release confirmation does not optimistically release a different claimant's code", () => {
  const store = fakeStore();
  const claimed = { ...code, claimedBy: "new@example.com" };
  store.setQuery(api.codes.list, { eventId }, [claimed]);
  releaseCodeOptimistic(store, { id: codeId, claimedBy: "old@example.com" });
  expect(store.getQuery(api.codes.list, { eventId })).toEqual([claimed]);
});

test("blacklist adds normalize identities, avoid duplicates, and ignore invalid inputs", () => {
  const store = fakeStore();
  store.setQuery(api.blacklist.list, {}, []);
  addBlacklistOptimistic(store, { email: " A@Example.com " });
  addBlacklistOptimistic(store, { email: "a@example.com" });
  addBlacklistOptimistic(store, { email: "invalid" });
  expect(store.getQuery(api.blacklist.list, {})).toMatchObject([{ email: "a@example.com" }]);
});

test("pending flagged approvals and rejection compose without duplicates or cross-event changes", () => {
  const store = fakeStore();
  const entries = ["a", "b", "c"].map((name) => ({
    _id: `flag-${name}` as Id<"flaggedEmails">, email: `${name}@example.com`,
    matchedEvents: [], otherMatchCount: 0, claimCount: 0,
  }));
  const other = { ...entries[0], _id: "other-flag" as Id<"flaggedEmails"> };
  store.setQuery(api.emails.listFlagged, { eventId }, { entries, hasMore: true });
  store.setQuery(api.emails.listFlagged, { eventId: otherEventId }, { entries: [other], hasMore: false });
  store.setQuery(api.emails.list, { eventId }, [{ ...email, email: entries[2].email }]);
  store.setQuery(api.emails.list, { eventId: otherEventId }, []);
  store.setQuery(api.codes.list, { eventId }, [{ ...code, reservedFor: entries[2].email }]);
  approveFlaggedOptimistic(store, { id: entries[0]._id });
  approveFlaggedOptimistic(store, { id: entries[0]._id });
  approveFlaggedOptimistic(store, { id: entries[1]._id });
  rejectFlaggedOptimistic(store, { id: entries[2]._id });
  expect(store.getQuery(api.emails.listFlagged, { eventId })).toEqual({ entries: [], hasMore: true });
  expect(store.getQuery(api.emails.list, { eventId })?.map((row) => row.email))
    .toEqual([entries[0].email, entries[1].email]);
  expect(store.getQuery(api.codes.list, { eventId })?.[0].reservedFor).toBeUndefined();
  expect(store.getQuery(api.emails.listFlagged, { eventId: otherEventId }))
    .toEqual({ entries: [other], hasMore: false });
  expect(store.getQuery(api.emails.list, { eventId: otherEventId })).toEqual([]);
  expect(entries).toHaveLength(3);
});

test("paginated and summary caches update optimistically for email and code actions", () => {
  const store = fakeStore();
  const pageOpts = { numItems: 50, cursor: null };
  store.setQuery(api.emails.listPage, { eventId, paginationOpts: pageOpts }, {
    page: [{ id: emailId, email: email.email, claimed: false, claimedCodes: [], blocked: false }],
    isDone: true,
    continueCursor: "",
  });
  store.setQuery(api.emails.summary, { eventId }, { total: 1, claimed: 0, unclaimed: 1 });
  store.setQuery(api.codes.listPage, { eventId, paginationOpts: pageOpts }, {
    page: [{ ...code, claimedBy: email.email, claimedAt: 1000 }],
    isDone: true,
    continueCursor: "",
  });
  store.setQuery(api.codes.summary, { eventId }, {
    total: 1,
    claimed: 1,
    available: 0,
    dispensable: 0,
    stripeClaimed: 0,
    stripeSynced: 0,
    stripeRedeemed: 0,
    blockTypes: ["Pro"],
    blocks: [{ type: "Pro", total: 1, claimed: 1, available: 0, expiryMin: undefined, expiryMax: undefined, hasNeverExpire: true, termsCount: 0, termsKind: undefined, mixedTerms: false }],
  });

  removeEmailOptimistic(store, { id: emailId });
  expect(store.getQuery(api.emails.listPage, { eventId, paginationOpts: pageOpts })?.page).toEqual([]);
  expect(store.getQuery(api.emails.summary, { eventId })).toEqual({ total: 0, claimed: 0, unclaimed: 0 });

  releaseCodeOptimistic(store, { id: codeId, claimedBy: email.email });
  expect(store.getQuery(api.codes.listPage, { eventId, paginationOpts: pageOpts })?.page[0].claimedBy).toBeUndefined();
  expect(store.getQuery(api.codes.summary, { eventId })).toMatchObject({ total: 1, claimed: 0, available: 1 });

  removeCodeOptimistic(store, { id: codeId });
  expect(store.getQuery(api.codes.listPage, { eventId, paginationOpts: pageOpts })?.page).toEqual([]);
  expect(store.getQuery(api.codes.summary, { eventId })).toMatchObject({ total: 0, claimed: 0, available: 0, blockTypes: [] });
});
