"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Ticket,
} from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { daysUntilEvent, formatEventDate } from "@/lib/event-date";
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
import { Skeleton } from "@/components/ui/skeleton";

// Past events stay in the main listing for this many days after their date;
// anything older waits behind "View older events" and pages 25 at a time.
const RECENT_PAST_DAYS = 14;
const OLDER_PAGE_SIZE = 25;

interface ManagedEventItem {
  _id: string;
  _creationTime: number;
  name: string;
  slug: string;
  eventDate?: string;
  hidden?: boolean;
  dynamic?: boolean;
}

function AdminEventRow({
  event,
  past,
}: {
  event: ManagedEventItem;
  past?: boolean;
}) {
  return (
    <li className="border-b border-border">
      <Link
        href={`/admin/events/${event._id}`}
        className={cn(
          "group flex items-center gap-6 px-2 py-5 transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 sm:px-4",
          past && "opacity-60 transition-opacity hover:opacity-100",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-heading font-medium tracking-tight">
            {event.name}
            {event.hidden ? <Badge variant="outline">Hidden</Badge> : null}
            {event.dynamic ? <Badge variant="outline">Dynamic</Badge> : null}
          </div>
        </div>
        <span className="hidden text-xs text-muted-dim tabular-nums md:inline">
          {event.eventDate
            ? formatEventDate(event.eventDate)
            : new Date(event._creationTime).toLocaleDateString("en-US", {
                month: "short",
                day: "2-digit",
                year: "numeric",
              })}
        </span>
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

  // Mirrors the home page grouping: dated events that have passed sink into
  // their own dimmed group; undated events count as active. Active events
  // order soonest-first, with undated ones following in their arrival
  // (newest created) order; past events list the most recently ended first.
  // YYYY-MM-DD compares correctly as a plain string.
  const active =
    events?.filter((e) => !e.eventDate || daysUntilEvent(e.eventDate) >= 0) ??
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
    e.eventDate ? -daysUntilEvent(e.eventDate) : 0;
  const byDateDesc = (a: ManagedEventItem, b: ManagedEventItem) =>
    (b.eventDate ?? "").localeCompare(a.eventDate ?? "");
  const past = (
    events?.filter((e) => daysAgo(e) > 0 && daysAgo(e) < RECENT_PAST_DAYS) ?? []
  ).sort(byDateDesc);
  const older = (
    events?.filter((e) => daysAgo(e) >= RECENT_PAST_DAYS) ?? []
  ).sort(byDateDesc);
  const olderPageCount = Math.max(1, Math.ceil(older.length / OLDER_PAGE_SIZE));
  const olderPageIndex = Math.min(olderPage, olderPageCount - 1);
  if (olderPage !== olderPageIndex) setOlderPage(olderPageIndex);
  const olderStart = olderPageIndex * OLDER_PAGE_SIZE;
  const olderVisible = older.slice(olderStart, olderStart + OLDER_PAGE_SIZE);

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
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/codes/new"
              className={buttonVariants({ variant: "outline" })}
            >
              <Ticket data-icon="inline-start" />
              New code block
            </Link>
            <Link href="/admin/events/new" className={buttonVariants()}>
              <Plus data-icon="inline-start" />
              New event
            </Link>
          </div>
        ) : null}
      </div>

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
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Active events
            </h2>
            <span className="font-mono text-xs text-muted-dim tabular-nums">
              {String(current.length).padStart(2, "0")}
            </span>
          </div>
          {current.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No active events right now.
            </p>
          ) : (
            <ul className="mt-4 border-t border-border">
              {current.map((event) => (
                <AdminEventRow key={event._id} event={event} />
              ))}
            </ul>
          )}
          {past.length > 0 ? (
            <>
              <div className="mt-12 flex items-baseline justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Past events
                </h2>
                <span className="font-mono text-xs text-muted-dim tabular-nums">
                  {String(past.length).padStart(2, "0")}
                </span>
              </div>
              <ul className="mt-4 border-t border-border">
                {past.map((event) => (
                  <AdminEventRow key={event._id} event={event} past />
                ))}
              </ul>
            </>
          ) : null}
          {older.length > 0 ? (
            showOlder ? (
              <>
                <div className="mt-12 flex items-baseline justify-between">
                  <h2 className="text-sm font-medium text-muted-foreground">
                    Older events
                  </h2>
                  <span className="font-mono text-xs text-muted-dim tabular-nums">
                    {String(older.length).padStart(2, "0")}
                  </span>
                </div>
                <ul className="mt-4 border-t border-border">
                  {olderVisible.map((event) => (
                    <AdminEventRow key={event._id} event={event} past />
                  ))}
                </ul>
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
        </>
      )}
    </div>
  );
}
