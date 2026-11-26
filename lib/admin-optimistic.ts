import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { optimisticallyUpdateValueInPaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { blockKey } from "@/convex/blockValues";
import { normalizeEmail, normalizeXHandle } from "@/lib/attendee-identity";
import { hasAllowedDomains, normalizeAllowedDomainsList } from "@/lib/allowed-domains";
import { slugify } from "@/lib/slug";

type Query = FunctionReference<"query">;

export function isOptimisticId(id: string | undefined): boolean {
  return id?.startsWith("optimistic:") ?? false;
}

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
  update(store, api.codes.listPage, (result, args) => args.eventId === eventId ? { ...result, page: result.page.map((code) => !code.claimedBy && code.reservedFor && emails.includes(code.reservedFor) ? { ...code, reservedFor: undefined } : code) } : result);
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
  const removedByEvent = new Map<Id<"events">, { email: string; claimed: boolean }>();
  update(store, api.emails.listPage, (result, args) => {
    const match = result.page.find((row) => row.id === id);
    if (!match) return result;
    removedByEvent.set(args.eventId, { email: match.email, claimed: match.claimed });
    return { ...result, page: result.page.filter((row) => row.id !== id) };
  });
  for (const [eventId, removed] of removedByEvent) {
    releaseReservations(store, eventId, [removed.email]);
    filterCooldowns(store, eventId, (rowId) => rowId !== id);
    update(store, api.emails.summary, (s, args) =>
      args.eventId === eventId && s
        ? {
            total: Math.max(0, s.total - 1),
            claimed: removed.claimed ? Math.max(0, s.claimed - 1) : s.claimed,
            unclaimed: removed.claimed ? s.unclaimed : Math.max(0, s.unclaimed - 1),
          }
        : s
    );
  }
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
  update(store, api.emails.listPage, (result, queryArgs) => {
    let changed = false;
    const page = result.page.map((row) => {
      if (row.id !== args.id) return row;
      changed = true;
      if (args.blocked) {
        releaseReservations(store, queryArgs.eventId, [row.email]);
        filterCooldowns(store, queryArgs.eventId, (id) => id !== args.id);
      }
      return { ...row, blocked: args.blocked };
    });
    return changed ? { ...result, page } : result;
  });
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
  update(store, api.emails.listPage, (result, queryArgs) => {
    if (queryArgs.eventId !== args.eventId) return result;
    releaseReservations(store, args.eventId, result.page.map((row) => row.email));
    return { ...result, page: [] };
  });
  update(store, api.emails.summary, (s, queryArgs) =>
    queryArgs.eventId === args.eventId && s ? { total: 0, claimed: 0, unclaimed: 0 } : s
  );
  filterCooldowns(store, args.eventId, () => false);
}

export function removeUnclaimedEmailsOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.emails.removeUnclaimed>) {
  const codes = store.getQuery(api.codes.list, { eventId: args.eventId });
  if (codes !== undefined) {
    const claimed = new Set(codes.map((code) => code.claimedBy));
    update(store, api.emails.list, (rows, queryArgs) => {
      if (queryArgs.eventId !== args.eventId) return rows;
      releaseReservations(store, args.eventId, rows.filter((row) => !claimed.has(row.email)).map((row) => row.email));
      return rows.filter((row) => claimed.has(row.email));
    });
  }
  update(store, api.emails.listPage, (result, queryArgs) => {
    if (queryArgs.eventId !== args.eventId) return result;
    releaseReservations(store, args.eventId, result.page.filter((row) => !row.claimed).map((row) => row.email));
    return { ...result, page: result.page.filter((row) => row.claimed) };
  });
  update(store, api.emails.summary, (s, queryArgs) =>
    queryArgs.eventId === args.eventId && s ? { total: s.claimed, claimed: s.claimed, unclaimed: 0 } : s
  );
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
    update(store, api.emails.summary, (s, emailArgs) =>
      emailArgs.eventId === queryArgs.eventId && s
        ? { ...s, total: s.total + 1, unclaimed: s.unclaimed + 1 }
        : s
    );
  }
  resolveFlaggedOptimistic(store, args);
}

export function rejectFlaggedOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.emails.rejectFlagged>) {
  for (const { args: queryArgs, value } of store.getAllQueries(api.emails.listFlagged)) {
    const flagged = value?.entries.find((row) => row._id === args.id);
    if (!flagged) continue;
    const rows = store.getQuery(api.emails.list, { eventId: queryArgs.eventId });
    for (const row of rows ?? []) if (row.email === flagged.email) removeEmailOptimistic(store, { id: row._id });
    for (const { args: pageArgs, value: pageVal } of store.getAllQueries(api.emails.listPage)) {
      if (pageArgs.eventId !== queryArgs.eventId || !pageVal) continue;
      for (const row of pageVal.page) if (row.email === flagged.email && row.id) removeEmailOptimistic(store, { id: row.id });
    }
  }
  resolveFlaggedOptimistic(store, args);
}

function dropEmptyTypes(store: OptimisticLocalStore, eventId: Id<"events">, removedTypes: (string | undefined)[]) {
  const codes = store.getQuery(api.codes.list, { eventId });
  const summary = store.getQuery(api.codes.summary, { eventId });
  const event = store.getQuery(api.events.get, { id: eventId });
  if ((codes === undefined && !summary) || !event) return;
  const empty = removedTypes
    .map((type) => type ?? "")
    .filter((type) => {
      if (!event.codeTypes?.includes(type)) return false;
      if (codes !== undefined) return !codes.some((code) => (code.codeType ?? "") === type);
      const block = summary?.blocks.find((b) => b.type === type);
      return !block || block.total <= 0;
    });
  if (empty.length === 0) return;
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
  update(store, api.codes.listPage, (result) => {
    let changed = false;
    const page = result.page.filter((code) => {
      if (code._id !== args.id || code.claimedBy) return true;
      changed = true;
      if (!removed.some((r) => r._id === code._id)) removed.push(code);
      return false;
    });
    return changed ? { ...result, page } : result;
  });
  for (const code of removed) {
    const type = code.codeType ?? "";
    update(store, api.codes.summary, (s, queryArgs) => {
      if (queryArgs.eventId !== code.eventId || !s) return s;
      const blocks = s.blocks
        .map((b) =>
          b.type === type
            ? { ...b, total: Math.max(0, b.total - 1), available: Math.max(0, b.available - 1) }
            : b
        )
        .filter((b) => b.total > 0);
      return {
        ...s,
        total: Math.max(0, s.total - 1),
        available: Math.max(0, s.available - 1),
        blockTypes: blocks.map((b) => b.type),
        blocks,
      };
    });
    dropEmptyTypes(store, code.eventId, [code.codeType]);
  }
}

export function allowReclaimOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.claims.allowReclaim>) {
  const targetEmail = args.email.trim().toLowerCase();
  const types: (string | undefined)[] = [];
  const removedByType = new Map<string, number>();
  const track = (code: Doc<"codes">) => {
    types.push(code.codeType);
    const key = code.codeType ?? "";
    removedByType.set(key, (removedByType.get(key) ?? 0) + 1);
  };
  update(store, api.codes.list, (codes, queryArgs) => queryArgs.eventId === args.eventId ? codes.filter((code) => {
    if (code.claimedBy !== targetEmail) return true;
    track(code);
    return false;
  }) : codes);
  const seenIds = new Set<string>();
  update(store, api.codes.listPage, (result, queryArgs) => {
    if (queryArgs.eventId !== args.eventId) return result;
    let changed = false;
    const page = result.page.filter((code) => {
      if (code.claimedBy !== targetEmail) return true;
      changed = true;
      if (!seenIds.has(code._id)) {
        seenIds.add(code._id);
        if (store.getQuery(api.codes.list, { eventId: args.eventId }) === undefined) {
          track(code);
        }
      }
      return false;
    });
    return changed ? { ...result, page } : result;
  });
  update(store, api.emails.listPage, (result, queryArgs) => {
    if (queryArgs.eventId !== args.eventId) return result;
    const event = store.getQuery(api.events.get, { id: args.eventId });
    const isSelfEnrolling = event?.dynamic === true || hasAllowedDomains(event);
    if (isSelfEnrolling) {
      return { ...result, page: result.page.filter((row) => row.email !== targetEmail) };
    }
    return {
      ...result,
      page: result.page.map((row) =>
        row.email === targetEmail ? { ...row, claimed: false, claimedCodes: [] } : row
      ),
    };
  });
  const totalRemoved = [...removedByType.values()].reduce((a, b) => a + b, 0);
  if (totalRemoved > 0) {
    update(store, api.codes.summary, (s, queryArgs) => {
      if (queryArgs.eventId !== args.eventId || !s) return s;
      const blocks = s.blocks
        .map((b) => {
          const n = removedByType.get(b.type) ?? 0;
          return n > 0
            ? { ...b, total: Math.max(0, b.total - n), claimed: Math.max(0, b.claimed - n) }
            : b;
        })
        .filter((b) => b.total > 0);
      return {
        ...s,
        total: Math.max(0, s.total - totalRemoved),
        claimed: Math.max(0, s.claimed - totalRemoved),
        blockTypes: blocks.map((b) => b.type),
        blocks,
      };
    });
  }
  update(store, api.emails.summary, (s, queryArgs) => {
    if (queryArgs.eventId !== args.eventId || !s) return s;
    const event = store.getQuery(api.events.get, { id: args.eventId });
    const isSelfEnrolling = event?.dynamic === true || hasAllowedDomains(event);
    return isSelfEnrolling
      ? { total: Math.max(0, s.total - 1), claimed: Math.max(0, s.claimed - 1), unclaimed: 0 }
      : { ...s, claimed: Math.max(0, s.claimed - 1), unclaimed: s.unclaimed + 1 };
  });
  dropEmptyTypes(store, args.eventId, types);
}

export function releaseCodeOptimistic(store: OptimisticLocalStore, args: FunctionArgs<typeof api.codes.release>) {
  let released: { eventId: Id<"events">; code: Doc<"codes"> } | null = null;
  update(store, api.codes.list, (codes, queryArgs) => {
    const target = codes.find((code) => code._id === args.id);
    if (!target?.claimedBy || (args.claimedBy !== undefined && target.claimedBy !== args.claimedBy)) return codes;
    released = { eventId: queryArgs.eventId, code: target };
    const event = store.getQuery(api.events.get, { id: queryArgs.eventId });
    if ((event?.dynamic || hasAllowedDomains(event)) && !codes.some((code) => code._id !== target._id && code.claimedBy === target.claimedBy)) {
      update(store, api.emails.list, (rows, emailArgs) => emailArgs.eventId === queryArgs.eventId ? rows.filter((row) => row.email !== target.claimedBy || row.blockedAt !== undefined) : rows);
    }
    return codes.map((code) => code._id === args.id ? { ...code, claimedBy: undefined, claimedAt: undefined } : code);
  });
  update(store, api.codes.listPage, (result, queryArgs) => {
    const target = result.page.find((code) => code._id === args.id);
    if (!target?.claimedBy || (args.claimedBy !== undefined && target.claimedBy !== args.claimedBy)) return result;
    if (!released) released = { eventId: queryArgs.eventId, code: target };
    return {
      ...result,
      page: result.page.map((code) =>
        code._id === args.id ? { ...code, claimedBy: undefined, claimedAt: undefined } : code
      ),
    };
  });
  if (released) {
    const { eventId, code } = released as { eventId: Id<"events">; code: Doc<"codes"> };
    const type = code.codeType ?? "";
    update(store, api.codes.summary, (s, queryArgs) => {
      if (queryArgs.eventId !== eventId || !s) return s;
      return {
        ...s,
        claimed: Math.max(0, s.claimed - 1),
        available: s.available + 1,
        blocks: s.blocks.map((b) =>
          b.type === type
            ? { ...b, claimed: Math.max(0, b.claimed - 1), available: b.available + 1 }
            : b
        ),
      };
    });
    update(store, api.emails.listPage, (result, queryArgs) => {
      if (queryArgs.eventId !== eventId) return result;
      const event = store.getQuery(api.events.get, { id: eventId });
      const isSelfEnrolling = event?.dynamic === true || hasAllowedDomains(event);
      return {
        ...result,
        page: result.page.flatMap((row) => {
          if (row.email !== code.claimedBy) return [row];
          const remaining = row.claimedCodes.filter((c) => c !== code.code);
          if (remaining.length === 0 && isSelfEnrolling) return [];
          return [{ ...row, claimed: remaining.length > 0, claimedCodes: remaining }];
        }),
      };
    });
  }
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
  const summary = store.getQuery(api.codes.summary, { eventId: args.eventId });
  if (!event || (codes === undefined && !summary)) return;
  const from = args.from?.trim() || "";
  const to = args.to.trim();
  const targets =
    codes !== undefined
      ? codes.some((code) => (code.codeType ?? "") === from)
      : (summary?.blocks.some((b) => b.type === from && b.total > 0) ?? false);
  update(store, api.codes.list, (rows, queryArgs) => queryArgs.eventId === args.eventId ? rows.map((code) => (code.codeType ?? "") === from ? { ...code, codeType: to } : code) : rows);
  update(store, api.codes.listPage, (result, queryArgs) => queryArgs.eventId === args.eventId ? { ...result, page: result.page.map((code) => (code.codeType ?? "") === from ? { ...code, codeType: to } : code) } : result);
  update(store, api.codes.summary, (s, queryArgs) => {
    if (queryArgs.eventId !== args.eventId || !s || !targets) return s;
    return {
      ...s,
      blockTypes: s.blockTypes.map((t) => (t === from ? to : t)),
      blocks: s.blocks.map((b) => (b.type === from ? { ...b, type: to } : b)),
    };
  });
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
  const summary = store.getQuery(api.codes.summary, { eventId: args.eventId });
  if (!event || (codes === undefined && !summary)) return;
  const type = args.codeType?.trim() || "";
  const kept =
    codes !== undefined
      ? codes.some((code) => (code.codeType ?? "") === type && code.claimedBy)
      : (summary?.blocks.some((b) => b.type === type && b.claimed > 0) ?? false);
  update(store, api.codes.list, (rows, queryArgs) => queryArgs.eventId === args.eventId ? rows.filter((code) => (code.codeType ?? "") !== type || !!code.claimedBy) : rows);
  update(store, api.codes.listPage, (result, queryArgs) => queryArgs.eventId === args.eventId ? { ...result, page: result.page.filter((code) => (code.codeType ?? "") !== type || !!code.claimedBy) } : result);
  update(store, api.codes.summary, (s, queryArgs) => {
    if (queryArgs.eventId !== args.eventId || !s) return s;
    const removed = s.blocks.find((b) => b.type === type);
    const removedUnclaimed = removed?.available ?? 0;
    const blocks = s.blocks.filter((b) => b.type !== type);
    return {
      ...s,
      total: Math.max(0, s.total - removedUnclaimed),
      available: Math.max(0, s.available - removedUnclaimed),
      blockTypes: blocks.map((b) => b.type),
      blocks,
    };
  });
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
  const nextAllowedDomains =
    args.allowedDomains !== undefined
      ? (() => {
          const { domains } = normalizeAllowedDomainsList(args.allowedDomains);
          return domains.length > 0 ? domains : undefined;
        })()
      : args.dynamic
        ? undefined
        : current.allowedDomains;
  const nextDynamic = !nextAllowedDomains && args.dynamic ? true : undefined;
  eventPatch(store, args.id, {
    name: args.name.trim(), slug: slugify(args.slug),
    description: args.description?.trim() || undefined,
    eventDate: date, eventEndDate: date && end && end > date ? end : undefined,
    claimInstructions: args.claimInstructions?.trim() || undefined,
    dynamic: nextDynamic,
    ...(args.allowedDomains !== undefined || args.dynamic ? { allowedDomains: nextAllowedDomains } : {}),
    ...(nextDynamic || nextAllowedDomains ? { walkUpSkipsReview: undefined } : args.walkUpSkipsReview !== undefined ? { walkUpSkipsReview: args.walkUpSkipsReview || undefined } : {}),
    ...(args.identity !== undefined ? { identity: args.identity === "x" ? "x" : undefined } : {}),
    ...(args.signInMessage !== undefined ? { signInMessage: args.signInMessage.trim() || undefined } : {}),
    ...(args.claimMessage !== undefined ? { claimMessage: args.claimMessage.trim() || undefined } : {}),
    ...(args.adminNote !== undefined ? { adminNote: args.adminNote.trim() || undefined } : {}),
    ...(args.contactEmail !== undefined ? { contactEmail: args.contactEmail.trim().toLowerCase() || undefined } : {}),
  });
}
