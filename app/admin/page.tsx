"use client";

import Link from "next/link";
import { CalendarPlus, Plus } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { daysUntilEvent, formatEventDate } from "@/lib/event-date";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

interface ManagedEventItem {
  _id: string;
  _creationTime: number;
  name: string;
  slug: string;
  eventDate?: string;
  hidden?: boolean;
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
  const past = (
    events?.filter((e) => e.eventDate && daysUntilEvent(e.eventDate) < 0) ?? []
  ).sort((a, b) => (b.eventDate ?? "").localeCompare(a.eventDate ?? ""));

  return (
    <div>
      <div className="mb-10 flex flex-col items-start gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-[-0.02em]">
            Events
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isGlobalAdmin
              ? "Create events and manage their emails and codes."
              : "Manage the emails and codes of your events."}
          </p>
        </div>
        {isGlobalAdmin ? <Link href="/admin/events/new" className={buttonVariants()}><Plus data-icon="inline-start" />New event</Link> : null}
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
        </>
      )}
    </div>
  );
}
