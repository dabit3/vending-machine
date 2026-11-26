"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Lock,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueries, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { looksLikeAttendeeQuery } from "@/lib/attendee-identity";
import {
  eventNeedsAttention,
  getStockStatus,
  summarizeDashboardAlerts,
  type EventHealthStats,
} from "@/lib/event-health";
import { markdownToPlainText } from "@/lib/markdown-plain";
import FavoriteButton from "@/components/FavoriteButton";
import AttendeeMatchBadges, {
  type AttendeeMatch,
} from "@/components/AttendeeMatchBadges";
import {
  daysSinceEventEnded,
  eventLastDay,
  formatEventDateRange,
} from "@/lib/event-date";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

type DashboardEventStats = EventHealthStats & {
  stripeRedemptionSyncStatus?: "pending" | "done" | "failed";
};

// Past events stay in the main listing for this many days after their date;
// anything older waits behind "View older events" and pages 25 at a time.
const RECENT_PAST_DAYS = 14;
const OLDER_PAGE_SIZE = 25;

interface ManagedEventItem {
  _id: string;
  _creationTime: number;
  name: string;
  slug: string;
  adminNote?: string;
  eventDate?: string;
  eventEndDate?: string;
  dynamic?: boolean;
  allowedDomains?: string[];
  identity?: "email" | "x";
  createdBy?: string;
  favorite?: boolean;
  archived?: boolean;
}

function AdminEventRow({
  event,
  past,
  isActive,
  match,
  stats,
}: {
  event: ManagedEventItem;
  past?: boolean;
  isActive?: boolean;
  match?: AttendeeMatch;
  stats?: DashboardEventStats;
}) {
  const stockStatus = stats ? getStockStatus(stats) : null;
  const activeEvent = isActive ?? (!past && !event.archived);
  return (
    <li className="flex items-center border-b border-border">
      <FavoriteButton
        eventId={event._id}
        eventName={event.name}
        favorite={event.favorite ?? false}
      />
      <Link
        href={`/admin/events/${event._id}`}
        className={cn(
          "group flex min-w-0 flex-1 flex-col gap-2 px-2 py-5 transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 sm:flex-row sm:items-center sm:gap-6 sm:px-4",
          past && "opacity-60 transition-opacity hover:opacity-100",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-heading font-medium tracking-tight">
            <span className="min-w-0 wrap-anywhere">{event.name}</span>
            {event.allowedDomains && event.allowedDomains.length > 0 ? (
              <Badge variant="outline" className="font-mono">
                @{event.allowedDomains[0]}
                {event.allowedDomains.length > 1
                  ? ` +${event.allowedDomains.length - 1}`
                  : ""}
              </Badge>
            ) : null}
            {event.dynamic ? <Badge variant="outline">Dynamic</Badge> : null}
            {event.identity === "x" ? (
              <Badge variant="outline">X handles</Badge>
            ) : null}
            {event.archived ? (
              <Badge variant="secondary">Archived</Badge>
            ) : null}
          </div>
          {match ? (
            <AttendeeMatchBadges match={match} />
          ) : event.adminNote || event.createdBy ? (
            <div className="flex flex-col gap-0.5">
              {event.adminNote ? (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">
                    {markdownToPlainText(event.adminNote)}
                  </span>
                </div>
              ) : null}
              {event.createdBy ? (
                <div className="truncate text-xs text-muted-dim">
                  Created by {event.createdBy}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {stats ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:shrink-0 sm:justify-end">
            {stats.pendingRequests > 0 ? (
              <Badge variant="default" className="font-mono tabular-nums">
                <Inbox aria-hidden />
                {stats.pendingRequests} request
                {stats.pendingRequests === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {stats.flaggedCount > 0 ? (
              <Badge
                variant="outline"
                className="font-mono text-amber-700 tabular-nums dark:text-amber-400"
              >
                <AlertTriangle aria-hidden />
                {stats.flaggedCount} flagged
              </Badge>
            ) : null}
            {stockStatus === "empty" && activeEvent ? (
              <Badge variant="destructive" className="font-mono tabular-nums">
                <AlertTriangle aria-hidden />
                Out of stock (0/{stats.totalCodes})
              </Badge>
            ) : stockStatus === "low" && activeEvent ? (
              <Badge
                variant="outline"
                className="font-mono text-amber-700 tabular-nums dark:text-amber-400"
              >
                <AlertTriangle aria-hidden />
                Low · {stats.remainingCodes}/{stats.totalCodes} left
              </Badge>
            ) : stats.totalCodes > 0 ? (
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {stats.remainingCodes}/{stats.totalCodes} left
              </span>
            ) : (
              <span className="font-mono text-xs text-muted-dim">No codes</span>
            )}
            {stats.stripeClaimedCodes > 0 ? (
              stats.stripeRedemptionSyncStatus === "pending" ? (
                <span className="font-mono text-xs text-muted-dim">
                  Syncing Stripe…
                </span>
              ) : stats.stripeSyncedCodes > 0 ? (
                <span className="font-mono text-xs text-muted-dim tabular-nums">
                  {stats.stripeRedeemedCodes}/{stats.stripeClaimedCodes} redeemed
                </span>
              ) : null
            ) : null}
          </div>
        ) : null}
        {event.eventDate ? (
          <span className="hidden text-xs text-muted-dim tabular-nums md:inline">
            {formatEventDateRange(event.eventDate, event.eventEndDate)}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

export default function AdminDashboard() {
  const events = useQuery(api.events.listManaged);
  const access = useQuery(api.admins.accessLevel);
  const isGlobalAdmin = access?.isGlobalAdmin ?? false;
  const [showOlder, setShowOlder] = useState(false);
  const [olderPage, setOlderPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [syncingRedemptions, setSyncingRedemptions] = useState(false);
  const syncAllStripeRedemptions = useMutation(
    api.codes.syncAllStripeRedemptions,
  );
  const search = useQuery(
    api.events.searchByAttendee,
    searchQuery ? { query: searchQuery } : "skip"
  );
  // Attendee search results do not carry the viewer's stars.
  const starredIds = new Set(
    events?.filter((e) => e.favorite).map((e) => e._id as string),
  );
  const nameFilter = searchInput.trim().toLowerCase();
  const attendeeLike = looksLikeAttendeeQuery(searchInput);
  const filtered = nameFilter
    ? events?.filter(
        (e) =>
          e.name.toLowerCase().includes(nameFilter) ||
          e.slug.includes(nameFilter) ||
          (e.adminNote !== undefined &&
            (markdownToPlainText(e.adminNote)
              .toLowerCase()
              .includes(nameFilter) ||
              e.adminNote.toLowerCase().includes(nameFilter))) ||
          (e.allowedDomains?.some((d) =>
            d.includes(nameFilter.replace(/^@/, ""))
          ) ??
            false)
      )
    : events;

  // Mirrors the home page grouping: dated events that have passed sink into
  // their own dimmed group; undated events count as active. Active events
  // order soonest-first, with undated ones following in their arrival
  // (newest created) order; past events list the most recently ended first.
  // YYYY-MM-DD compares correctly as a plain string.
  // Archived events leave the date groups entirely and list under their own
  // section at the bottom of the page.
  const archived = filtered?.filter((e) => e.archived) ?? [];
  const unarchived = filtered?.filter((e) => !e.archived);
  const active =
    unarchived?.filter(
      (e) => !e.eventDate || daysSinceEventEnded(e.eventDate, e.eventEndDate) <= 0
    ) ??
    [];
  const current = [
    ...active
      .filter((e) => e.eventDate)
      .sort((a, b) => (a.eventDate ?? "").localeCompare(b.eventDate ?? "")),
    ...active.filter((e) => !e.eventDate),
  ];
  // Ended events split at RECENT_PAST_DAYS: the recent ones list under
  // "Past events", the rest are collapsed and paged under "Older events".
  const daysAgo = (e: ManagedEventItem) =>
    e.eventDate ? daysSinceEventEnded(e.eventDate, e.eventEndDate) : 0;
  const lastDay = (e: ManagedEventItem) =>
    e.eventDate ? eventLastDay(e.eventDate, e.eventEndDate) : "";
  const byDateDesc = (a: ManagedEventItem, b: ManagedEventItem) =>
    lastDay(b).localeCompare(lastDay(a));
  const past = (
    unarchived?.filter((e) => daysAgo(e) > 0 && daysAgo(e) < RECENT_PAST_DAYS) ?? []
  ).sort(byDateDesc);
  const older = (
    unarchived?.filter((e) => daysAgo(e) >= RECENT_PAST_DAYS) ?? []
  ).sort(byDateDesc);
  // Starred events are pinned above the date groups, in the same order, and
  // stay listed in their group.
  const starred = [...current, ...past, ...older].filter((e) => e.favorite);
  const olderPageCount = Math.max(1, Math.ceil(older.length / OLDER_PAGE_SIZE));
  const olderPageIndex = Math.min(olderPage, olderPageCount - 1);
  if (olderPage !== olderPageIndex) setOlderPage(olderPageIndex);
  const olderStart = olderPageIndex * OLDER_PAGE_SIZE;
  const olderVisible = older.slice(olderStart, olderStart + OLDER_PAGE_SIZE);

  // Query stock, queue, and Stripe redemption counts for visible events
  // (plus all active events so low-stock alerts stay complete even while
  // filtering). Collapsed older and archived events are skipped until shown.
  const allUnarchived = events?.filter((e) => !e.archived) ?? [];
  const allActiveIds = new Set(
    allUnarchived
      .filter(
        (e) =>
          !e.eventDate || daysSinceEventEnded(e.eventDate, e.eventEndDate) <= 0,
      )
      .map((e) => e._id as string),
  );
  const statsEventIds = [
    ...new Set([
      ...(search?.results.map((r) => r._id) ?? []),
      ...(nameFilter
        ? [
            ...starred.map((e) => e._id),
            ...current.map((e) => e._id),
            ...past.map((e) => e._id),
            ...olderVisible.map((e) => e._id),
          ]
        : []),
      ...allUnarchived
        .filter(
          (e) =>
            !e.eventDate ||
            daysSinceEventEnded(e.eventDate, e.eventEndDate) < RECENT_PAST_DAYS,
        )
        .map((e) => e._id),
      ...starred.map((e) => e._id),
      ...(showOlder ? olderVisible.map((e) => e._id) : []),
    ]),
  ] as Id<"events">[];

  // Fetch stats in 5-event chunks so each Convex query transaction stays well
  // within document read limits even for large inventories, and so dashboards
  // with > 100 events still receive stats for every visible event.
  const DASHBOARD_STATS_CHUNK_SIZE = 5;
  const statsQueries = Object.fromEntries(
    Array.from(
      { length: Math.ceil(statsEventIds.length / DASHBOARD_STATS_CHUNK_SIZE) },
      (_, i) => [
        `chunk-${i}`,
        {
          query: api.events.dashboardStats,
          args: {
            eventIds: statsEventIds.slice(
              i * DASHBOARD_STATS_CHUNK_SIZE,
              (i + 1) * DASHBOARD_STATS_CHUNK_SIZE,
            ),
          },
        },
      ],
    ),
  );
  const statsChunks = useQueries(statsQueries);
  const statsMap: Record<string, DashboardEventStats> = {};
  for (const chunk of Object.values(statsChunks)) {
    if (chunk && !(chunk instanceof Error)) {
      Object.assign(statsMap, chunk as Record<string, DashboardEventStats>);
    }
  }

  const alerts = summarizeDashboardAlerts(
    allUnarchived.map((e) => ({
      _id: e._id,
      isActive: allActiveIds.has(e._id),
      stats: statsMap?.[e._id],
    })),
  );
  const hasAlerts = alerts.attentionEventIds.size > 0;
  const effectiveAttentionOnly = attentionOnly && hasAlerts;

  const filterByAttention = (list: ManagedEventItem[], activeList: boolean) =>
    effectiveAttentionOnly
      ? list.filter((e) => eventNeedsAttention(statsMap?.[e._id], activeList))
      : list;

  const visibleCurrent = filterByAttention(current, true);
  const visiblePast = filterByAttention(past, false);
  const visibleOlder = filterByAttention(older, false);
  const visibleOlderSlice = effectiveAttentionOnly
    ? filterByAttention(olderVisible, false)
    : olderVisible;
  const showOlderSection =
    visibleOlder.length > 0 ||
    (effectiveAttentionOnly && showOlder && older.length > OLDER_PAGE_SIZE);
  const visibleSearchResults = search
    ? effectiveAttentionOnly
      ? search.results.filter((r) => {
          const isPast = r.eventDate
            ? daysSinceEventEnded(r.eventDate, r.eventEndDate) > 0
            : false;
          return eventNeedsAttention(statsMap?.[r._id], !isPast);
        })
      : search.results
    : [];
  const visibleStarred = effectiveAttentionOnly
    ? starred.filter((e) =>
        eventNeedsAttention(statsMap?.[e._id], allActiveIds.has(e._id)),
      )
    : starred;
  const visibleArchived = effectiveAttentionOnly ? [] : archived;

  const stripeSyncableIds = statsEventIds.filter(
    (id) => (statsMap?.[id]?.stripeClaimedCodes ?? 0) > 0,
  );
  const anyStripeSyncPending = stripeSyncableIds.some(
    (id) => statsMap?.[id]?.stripeRedemptionSyncStatus === "pending",
  );

  async function handleSyncAllRedemptions() {
    if (stripeSyncableIds.length === 0) return;
    setSyncingRedemptions(true);
    try {
      const BATCH_SIZE = 25;
      let eventsStarted = 0;
      let stripeCodes = 0;
      for (let i = 0; i < stripeSyncableIds.length; i += BATCH_SIZE) {
        const res = await syncAllStripeRedemptions({
          eventIds: stripeSyncableIds.slice(i, i + BATCH_SIZE),
        });
        eventsStarted += res.eventsStarted;
        stripeCodes += res.stripeCodes;
      }
      if (stripeCodes === 0) {
        toast.info("All Stripe redemptions are already syncing.");
      } else {
        toast.success(
          `Checking ${stripeCodes} claimed Stripe code${stripeCodes === 1 ? "" : "s"} across ${eventsStarted} event${eventsStarted === 1 ? "" : "s"}.`,
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not sync Stripe redemptions",
      );
    } finally {
      setSyncingRedemptions(false);
    }
  }

  return (
    <div>
      <div className="mb-10 flex flex-col items-start gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-[-0.02em]">
            Events
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isGlobalAdmin
              ? "Create events, or save code blocks for later from Codes."
              : "Manage the emails and codes of your events."}
          </p>
        </div>
        {isGlobalAdmin ? (
          <Link href="/admin/events/new" className={buttonVariants()}>
            <Plus data-icon="inline-start" />
            New event
          </Link>
        ) : null}
      </div>

      {hasAlerts ? (
        <div
          role="status"
          aria-live="polite"
          className="mb-8 flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <AlertTriangle
                className="size-4 text-amber-600 dark:text-amber-400"
                aria-hidden
              />
              Needs attention
            </span>
            {alerts.outOfStockCount > 0 ? (
              <span className="font-mono text-xs text-destructive tabular-nums">
                {alerts.outOfStockCount} out of stock
              </span>
            ) : null}
            {alerts.lowStockCount > 0 ? (
              <span className="font-mono text-xs text-amber-700 tabular-nums dark:text-amber-400">
                {alerts.lowStockCount} low stock
              </span>
            ) : null}
            {alerts.pendingRequestsTotal > 0 ? (
              <span className="font-mono text-xs text-foreground tabular-nums">
                {alerts.pendingRequestsTotal} pending request
                {alerts.pendingRequestsTotal === 1 ? "" : "s"}
              </span>
            ) : null}
            {alerts.flaggedTotal > 0 ? (
              <span className="font-mono text-xs text-amber-700 tabular-nums dark:text-amber-400">
                {alerts.flaggedTotal} flagged
              </span>
            ) : null}
          </div>
          <Button
            type="button"
            variant={effectiveAttentionOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setAttentionOnly((prev) => !prev)}
            className="self-start sm:self-auto"
          >
            {effectiveAttentionOnly
              ? "Show all events"
              : `Filter (${alerts.attentionEventIds.size})`}
          </Button>
        </div>
      ) : null}

      {events && events.length > 0 ? (
        <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <form
            role="search"
            className="flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (attendeeLike) setSearchQuery(searchInput.trim());
            }}
          >
            <InputGroup className="h-10 sm:max-w-md">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                aria-label="Search events by name, or find an attendee by email or X handle"
                placeholder="Search events, or find an attendee by email or @handle"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  if (e.target.value.trim() !== searchQuery) setSearchQuery("");
                }}
              />
              {attendeeLike && !searchQuery ? (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton type="submit" variant="secondary" size="xs">
                    Find attendee
                  </InputGroupButton>
                </InputGroupAddon>
              ) : searchInput ? (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    aria-label="Clear search"
                    onClick={() => {
                      setSearchInput("");
                      setSearchQuery("");
                    }}
                  >
                    <X />
                  </InputGroupButton>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
          </form>
          {isGlobalAdmin && stripeSyncableIds.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={syncingRedemptions || anyStripeSyncPending}
              onClick={handleSyncAllRedemptions}
              className="self-start sm:self-auto"
            >
              {syncingRedemptions || anyStripeSyncPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RefreshCw data-icon="inline-start" />
              )}
              {anyStripeSyncPending
                ? "Syncing Stripe…"
                : "Sync Stripe redemptions"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {searchQuery ? (
        <section aria-live="polite" className="mb-12">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="min-w-0 truncate text-sm font-medium text-muted-foreground">
              Events for{" "}
              <span className="font-mono text-foreground">
                {search?.key ?? searchQuery}
              </span>
            </h2>
            {search ? (
              <span className="font-mono text-xs text-muted-dim tabular-nums">
                {String(search.results.length).padStart(2, "0")}
              </span>
            ) : null}
          </div>
          {search === undefined ? (
            <div className="mt-4 flex flex-col gap-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : search === null ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Enter a full email address or X handle, like name@example.com or
              @handle.
            </p>
          ) : search.results.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No events have this attendee on their list, claims, flagged
              entries or access requests.
            </p>
          ) : visibleSearchResults.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              None of this attendee&apos;s events need attention.
            </p>
          ) : (
            <ul className="mt-4 border-t border-border">
              {visibleSearchResults.map((result) => (
                <AdminEventRow
                  key={result._id}
                  event={{ ...result, favorite: starredIds.has(result._id) }}
                  match={result}
                  stats={statsMap?.[result._id]}
                  past={
                    result.eventDate
                      ? daysSinceEventEnded(
                          result.eventDate,
                          result.eventEndDate
                        ) > 0
                      : false
                  }
                />
              ))}
            </ul>
          )}
        </section>
      ) : null}
      {events === undefined ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <Empty className="border border-dashed border-border-strong py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarPlus />
            </EmptyMedia>
            <EmptyTitle>No events yet</EmptyTitle>
            <EmptyDescription>
              {isGlobalAdmin
                ? "Create your first event to start dispensing codes."
                : "Events you administer will appear here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : nameFilter && current.length + past.length + older.length + archived.length === 0 ? (
        searchQuery ? null : (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            No events match &ldquo;{searchInput.trim()}&rdquo;.
            {attendeeLike
              ? " Press Enter to find events this attendee is on."
              : null}
          </p>
        )
      ) : (
        <>
          {visibleStarred.length > 0 ? (
            <section aria-labelledby="starred-events" className="mb-10">
              <div className="flex items-baseline justify-between">
                <h2
                  id="starred-events"
                  className="text-sm font-medium text-muted-foreground"
                >
                  Starred
                </h2>
                <span className="font-mono text-xs text-muted-dim tabular-nums">
                  {String(visibleStarred.length).padStart(2, "0")}
                </span>
              </div>
              <ul className="mt-4 border-t border-border">
                {visibleStarred.map((event) => (
                  <AdminEventRow
                    key={event._id}
                    event={event}
                    isActive={allActiveIds.has(event._id)}
                    stats={statsMap?.[event._id]}
                  />
                ))}
              </ul>
            </section>
          ) : null}
          {!nameFilter && !effectiveAttentionOnly || visibleCurrent.length > 0 ? (
            <>
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Active events
                </h2>
                <span className="font-mono text-xs text-muted-dim tabular-nums">
                  {String(visibleCurrent.length).padStart(2, "0")}
                </span>
              </div>
              {visibleCurrent.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  No active events right now.
                </p>
              ) : (
                <ul className="mt-4 border-t border-border">
                  {visibleCurrent.map((event) => (
                    <AdminEventRow
                      key={event._id}
                      event={event}
                      isActive
                      stats={statsMap?.[event._id]}
                    />
                  ))}
                </ul>
              )}
            </>
          ) : null}
          {visiblePast.length > 0 ? (
            <>
              <div className="mt-12 flex items-baseline justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Past events
                </h2>
                <span className="font-mono text-xs text-muted-dim tabular-nums">
                  {String(visiblePast.length).padStart(2, "0")}
                </span>
              </div>
              <ul className="mt-4 border-t border-border">
                {visiblePast.map((event) => (
                  <AdminEventRow
                    key={event._id}
                    event={event}
                    past
                    stats={statsMap?.[event._id]}
                  />
                ))}
              </ul>
            </>
          ) : null}
          {showOlderSection ? (
            showOlder || nameFilter || effectiveAttentionOnly ? (
              <>
                <div className="mt-12 flex items-baseline justify-between">
                  <h2 className="text-sm font-medium text-muted-foreground">
                    Older events
                  </h2>
                  <span className="font-mono text-xs text-muted-dim tabular-nums">
                    {String(
                      effectiveAttentionOnly
                        ? visibleOlderSlice.length
                        : visibleOlder.length,
                    ).padStart(2, "0")}
                  </span>
                </div>
                {visibleOlderSlice.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    No older events on this page need attention.
                  </p>
                ) : (
                  <ul className="mt-4 border-t border-border">
                    {visibleOlderSlice.map((event) => (
                      <AdminEventRow
                        key={event._id}
                        event={event}
                        past
                        stats={statsMap?.[event._id]}
                      />
                    ))}
                  </ul>
                )}
                {older.length > OLDER_PAGE_SIZE ? (
                  <nav
                    aria-label="Older events pages"
                    className="mt-4 flex items-center justify-between gap-4"
                  >
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {olderStart + 1}–{olderStart + olderVisible.length} of{" "}
                      {older.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={olderPageIndex === 0}
                        onClick={() => setOlderPage(olderPageIndex - 1)}
                      >
                        <ChevronLeft data-icon="inline-start" />
                        Previous
                      </Button>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Page {olderPageIndex + 1} of {olderPageCount}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={olderPageIndex >= olderPageCount - 1}
                        onClick={() => setOlderPage(olderPageIndex + 1)}
                      >
                        Next
                        <ChevronRight data-icon="inline-end" />
                      </Button>
                    </div>
                  </nav>
                ) : null}
              </>
            ) : (
              <div className="mt-10 flex justify-center">
                <Button variant="outline" onClick={() => setShowOlder(true)}>
                  <ChevronDown data-icon="inline-start" />
                  View {older.length} older event{older.length === 1 ? "" : "s"}
                </Button>
              </div>
            )
          ) : null}
          {visibleArchived.length > 0 ? (
            <>
              <div className="mt-12 flex items-baseline justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Archived events
                </h2>
                <span className="font-mono text-xs text-muted-dim tabular-nums">
                  {String(visibleArchived.length).padStart(2, "0")}
                </span>
              </div>
              <ul className="mt-4 border-t border-border">
                {visibleArchived.map((event) => (
                  <AdminEventRow key={event._id} event={event} past />
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
