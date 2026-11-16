import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { optimisticallyUpdateValueInPaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { blockKey } from "@/convex/blockValues";
import { normalizeEmail, normalizeXHandle } from "@/lib/attendee-identity";
import { slugify } from "@/lib/slug";

type Query = FunctionReference<"query">;
function update<Q extends Query>(store: OptimisticLocalStore, query: Q, transform: (value: FunctionReturnType<Q>, args: FunctionArgs<Q>) => FunctionReturnType<Q>) {
  for (const { args, value } of store.getAllQueries(query)) {
    if (value !== undefined) store.setQuery(query, args, transform(value, args));
  }
}

function eventPatch(store: OptimisticLocalStore, id: Id<"events">, patch: Partial<Doc<"events">>) {
  update(store, api.events.get, (event, args) => args.id === id && event ? { ...event, ...patch, identity: "identity" in patch ? (patch.identity ?? "email") : event.identity } : event);
  update(store, api.events.listManaged, (events) => events.map((event) => event._id === id ? { ...event, ...patch, identity: "identity" in patch ? (patch.identity ?? "email") : event.identity } : event));
}

function releaseReservations(store: OptimisticLocalStore, eventId: Id<"events">, emails: string[]) {
  update(store, api.codes.list, (codes, args) => args.eventId === eventId ? codes.map((code) => !code.claimedBy && code.reservedFor && emails.includes(code.reservedFor) ? { ...code, reservedFor: undefined } : code) : codes);
}

function filterCooldowns(store: OptimisticLocalStore, eventId: Id<"events">, keep: (id: Id<"emails">) => boolean) {
  // Preserve page cursors and boundaries while removing rows from loaded pages.
  update(store, api.emails.listCooldowns, (result, args) => args.eventId === eventId ? { ...result, page: result.page.filter((row) => keep(row.id)) } : result);
}

export function removeEmailOptimistic(store: OptimisticLocalStore, { id }: FunctionArgs<typeof api.emails.remove>) {
  update(store, api.emails.list, (rows, args) => {
    const removed = rows.filter((row) => row._id === id);
    releaseReservations(store, args.eventId, removed.map((row) => row.email));
    filterCooldowns(store, args.eventId, (rowId) => rowId !== id);
    return rows.filter((row) => row._id !== id);
  });
}

export function setBlockedOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.emails.setBlocked>) {
  update(store, api.emails.list, (rows, queryArgs) => rows.map((row) => {
    if (row._id !== args.id) return row;
    if (args.blocked) {
      releaseReservations(store, queryArgs.eventId, [row.email]);
      filterCooldowns(store, queryArgs.eventId, (id) => id !== row._id);
    }
    return { ...row, blockedAt: args.blocked ? (row.blockedAt ?? 0) : undefined, blockedBy: undefined };
  }));
}

export function setCooldownOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.emails.setCooldownWaived>) {
  update(store, api.emails.list, (rows) => rows.map((row) => row._id === args.id ? { ...row, cooldownWaivedAt: args.waived ? (row.cooldownWaivedAt ?? 0) : undefined, cooldownWaivedBy: undefined } : row));
  const eventIds = new Set(store.getAllQueries(api.emails.listCooldowns).map(({ args }) => args.eventId));
  for (const eventId of eventIds) {
    optimisticallyUpdateValueInPaginatedQuery(store, api.emails.listCooldowns, { eventId }, (row) => row.id === args.id ? { ...row, waived: args.waived } : row);
    if (!args.waived) update(store, api.emails.listCooldowns, (result, queryArgs) => queryArgs.eventId === eventId ? { ...result, page: result.page.filter((row) => row.id !== args.id || row.eligibleAt !== undefined) } : result);
  }
}

export function removeAllEmailsOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.emails.removeAll>) {
  update(store, api.emails.list, (rows, queryArgs) => {
    if (queryArgs.eventId !== args.eventId) return rows;
    releaseReservations(store, args.eventId, rows.map((row) => row.email));
    return [];
  });
  filterCooldowns(store, args.eventId, () => false);
}

export function removeUnclaimedEmailsOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.emails.removeUnclaimed>) {
  const codes = store.getQuery(api.codes.list, { eventId: args.eventId });
  if (codes === undefined) return;
  const claimed = new Set(codes.map((code) => code.claimedBy));
  update(store, api.emails.list, (rows, queryArgs) => {
    if (queryArgs.eventId !== args.eventId) return rows;
    releaseReservations(store, args.eventId, rows.filter((row) => !claimed.has(row.email)).map((row) => row.email));
    return rows.filter((row) => claimed.has(row.email));
  });
  filterCooldowns(store, args.eventId, () => false);
}

export function resolveFlaggedOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.emails.rejectFlagged>) {
  update(store, api.emails.listFlagged, (result) => ({ ...result, entries: result.entries.filter((row) => row._id !== args.id) }));
}

export function approveFlaggedOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.emails.approveFlagged>) {
  for (const { args: queryArgs, value } of store.getAllQueries(api.emails.listFlagged)) {
    const flagged = value?.entries.find((row) => row._id === args.id);
    if (!flagged) continue;
    update(store, api.emails.list, (rows, emailArgs) => emailArgs.eventId === queryArgs.eventId && !rows.some((row) => row.email === flagged.email) ? [...rows, { _id: `optimistic:${args.id}` as Id<"emails">, _creationTime: 0, eventId: queryArgs.eventId, email: flagged.email }] : rows);
  }
  resolveFlaggedOptimistic(store, args);
}

export function rejectFlaggedOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.emails.rejectFlagged>) {
  for (const { args: queryArgs, value } of store.getAllQueries(api.emails.listFlagged)) {
    const flagged = value?.entries.find((row) => row._id === args.id);
    if (!flagged) continue;
    const rows = store.getQuery(api.emails.list, { eventId: queryArgs.eventId });
    for (const row of rows ?? []) if (row.email === flagged.email) removeEmailOptimistic(store, { id: row._id });
  }
  resolveFlaggedOptimistic(store, args);
}

function dropEmptyTypes(store: OptimisticLocalStore, eventId: Id<"events">, removedTypes: (string | undefined)[]) {
  const codes = store.getQuery(api.codes.list, { eventId });
  const event = store.getQuery(api.events.get, { id: eventId });
  if (codes === undefined || !event) return;
  const empty = removedTypes.map((type) => type ?? "").filter((type) => event.codeTypes?.includes(type) && !codes.some((code) => (code.codeType ?? "") === type));
  const values = { ...event.codeTypeValues };
  for (const type of empty) delete values[blockKey(type)];
  eventPatch(store, eventId, { codeTypes: event.codeTypes?.filter((type) => !empty.includes(type)), archivedCodeTypes: event.archivedCodeTypes?.filter((type) => !empty.includes(type)), codeTypeValues: values });
}

export function removeCodeOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.codes.remove>) {
  const removed: Doc<"codes">[] = [];
  update(store, api.codes.list, (codes) => codes.filter((code) => {
    if (code._id !== args.id || code.claimedBy) return true;
    removed.push(code);
    return false;
  }));
  for (const code of removed) dropEmptyTypes(store, code.eventId, [code.codeType]);
}

export function allowReclaimOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.claims.allowReclaim>) {
  const types: (string | undefined)[] = [];
  update(store, api.codes.list, (codes, queryArgs) => queryArgs.eventId === args.eventId ? codes.filter((code) => {
    if (code.claimedBy !== args.email.trim().toLowerCase()) return true;
    types.push(code.codeType);
    return false;
  }) : codes);
  dropEmptyTypes(store, args.eventId, types);
}

export function releaseCodeOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.codes.release>) {
  update(store, api.codes.list, (codes, queryArgs) => {
    const target = codes.find((code) => code._id === args.id);
    if (!target?.claimedBy || (args.claimedBy !== undefined && target.claimedBy !== args.claimedBy)) return codes;
    const event = store.getQuery(api.events.get, { id: queryArgs.eventId });
    if (event?.dynamic && !codes.some((code) => code._id !== target._id && code.claimedBy === target.claimedBy)) {
      update(store, api.emails.list, (rows, emailArgs) => emailArgs.eventId === queryArgs.eventId ? rows.filter((row) => row.email !== target.claimedBy || row.blockedAt !== undefined) : rows);
    }
    return codes.map((code) => code._id === args.id ? { ...code, claimedBy: undefined, claimedAt: undefined } : code);
  });
}

export function setTypeValueOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.codes.setTypeValue>) {
  const event = store.getQuery(api.events.get, { id: args.eventId });
  if (!event) return;
  const values = { ...event.codeTypeValues };
  const key = blockKey(args.codeType?.trim());
  if (args.value?.trim()) values[key] = args.value.trim();
  else delete values[key];
  eventPatch(store, args.eventId, { codeTypeValues: values });
}

export function setTypeArchivedOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.codes.setTypeArchived>) {
  const event = store.getQuery(api.events.get, { id: args.eventId });
  if (!event) return;
  const type = args.codeType?.trim() || "";
  eventPatch(store, args.eventId, { archivedCodeTypes: args.archived ? [...new Set([...(event.archivedCodeTypes ?? []), type])] : event.archivedCodeTypes?.filter((value) => value !== type) });
}

export function renameTypeOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.codes.renameType>) {
  const event = store.getQuery(api.events.get, { id: args.eventId });
  const codes = store.getQuery(api.codes.list, { eventId: args.eventId });
  if (!event || codes === undefined) return;
  const from = args.from?.trim() || "";
  const to = args.to.trim();
  const targets = codes.some((code) => (code.codeType ?? "") === from);
  update(store, api.codes.list, (rows, queryArgs) => queryArgs.eventId === args.eventId ? rows.map((code) => (code.codeType ?? "") === from ? { ...code, codeType: to } : code) : rows);
  const values = { ...event.codeTypeValues };
  if (targets && blockKey(from) in values && !(blockKey(to) in values)) values[blockKey(to)] = values[blockKey(from)];
  if (blockKey(from) !== blockKey(to)) delete values[blockKey(from)];
  const ordered = (event.codeTypes ?? []).map((type) => type === from && targets ? to : type);
  if (targets && !ordered.includes(to)) ordered.push(to);
  eventPatch(store, args.eventId, { codeTypes: [...new Set(ordered)].filter((type) => targets || type !== from), codeTypeValues: values, archivedCodeTypes: event.archivedCodeTypes?.map((type) => type === from && targets ? to : type) });
}

export function removeTypeOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.codes.removeType>) {
  const event = store.getQuery(api.events.get, { id: args.eventId });
  const codes = store.getQuery(api.codes.list, { eventId: args.eventId });
  if (!event || codes === undefined) return;
  const type = args.codeType?.trim() || "";
  const kept = codes.some((code) => (code.codeType ?? "") === type && code.claimedBy);
  update(store, api.codes.list, (rows, queryArgs) => queryArgs.eventId === args.eventId ? rows.filter((code) => (code.codeType ?? "") !== type || !!code.claimedBy) : rows);
  const values = { ...event.codeTypeValues };
  if (!kept) delete values[blockKey(type)];
  eventPatch(store, args.eventId, { codeTypes: event.codeTypes?.filter((value) => value !== type), codeTypeValues: values, archivedCodeTypes: event.archivedCodeTypes?.filter((value) => value !== type) });
}

export function setClaimModeOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.events.setClaimMode>) {
  eventPatch(store, args.id, { claimMode: args.claimMode === "all" ? "all" : undefined });
}

export function renameEventOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.events.rename>) {
  eventPatch(store, args.id, { name: args.name.trim() });
}

export function removeEventOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.events.remove>) {
  update(store, api.events.get, (event, queryArgs) => queryArgs.id === args.id ? null : event);
  update(store, api.events.listManaged, (events) => events.filter((event) => event._id !== args.id));
}

export function removeAdminOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.admins.remove>) {
  update(store, api.admins.list, (rows) => rows.filter((row) => row._id !== args.id));
}

export function removeEventAdminOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.eventAdmins.remove>) {
  update(store, api.eventAdmins.list, (rows) => rows.filter((row) => row._id !== args.id));
}

export function removeBlacklistOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.blacklist.remove>) {
  update(store, api.blacklist.list, (rows) => {
    const removed = rows.find((row) => row._id === args.id);
    if (removed) update(store, api.blacklist.listHits, (hits) => hits.filter((hit) => hit.email !== removed.email));
    return rows.filter((row) => row._id !== args.id);
  });
}

export function addAdminOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.admins.add>) {
  const email = args.email.trim().toLowerCase();
  update(store, api.admins.list, (rows) => rows.some((row) => row.email === email) ? rows : [...rows, { _id: `optimistic:${email}` as Id<"admins">, email, isSelf: false }]);
}

export function addEventAdminOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.eventAdmins.add>) {
  const email = args.email.trim().toLowerCase();
  update(store, api.eventAdmins.list, (rows, queryArgs) => queryArgs.eventId !== args.eventId || rows.some((row) => row.email === email) ? rows : [...rows, { _id: `optimistic:${email}` as Id<"eventAdmins">, email, isSelf: false }]);
}

export function addBlacklistOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.blacklist.add>) {
  const raw = args.email.trim();
  const email = raw.startsWith("@") ? normalizeXHandle(raw) : normalizeEmail(raw);
  if (!email) return;
  update(store, api.blacklist.list, (rows) => rows.some((row) => row.email === email) ? rows : [...rows, { _id: `optimistic:${email}` as Id<"blacklistedEmails">, _creationTime: 0, email }]);
  update(store, api.emails.listFlagged, (result) => ({ ...result, entries: result.entries.filter((row) => row.email !== email) }));
}

export function updateEventOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.events.update>) {
  const current = store.getQuery(api.events.get, { id: args.id });
  if (!current) return;
  const date = args.eventDate?.trim() || undefined;
  const end = (args.eventEndDate ?? current.eventEndDate)?.trim();
  eventPatch(store, args.id, {
    name: args.name.trim(), slug: slugify(args.slug),
    description: args.description?.trim() || undefined,
    eventDate: date, eventEndDate: date && end && end > date ? end : undefined,
    claimInstructions: args.claimInstructions?.trim() || undefined,
    dynamic: args.dynamic || undefined,
    ...(args.dynamic ? { walkUpSkipsReview: undefined } : args.walkUpSkipsReview !== undefined ? { walkUpSkipsReview: args.walkUpSkipsReview || undefined } : {}),
    ...(args.identity !== undefined ? { identity: args.identity === "x" ? "x" : undefined } : {}),
    ...(args.signInMessage !== undefined ? { signInMessage: args.signInMessage.trim() || undefined } : {}),
    ...(args.contactEmail !== undefined ? { contactEmail: args.contactEmail.trim().toLowerCase() || undefined } : {}),
  });
}
