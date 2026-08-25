"use client";

import Link from "next/link";
import { BadgeCheck, Ticket } from "lucide-react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { daysUntilEvent, formatEventDate } from "@/lib/event-date";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

interface EventItem {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  eventDate?: string;
}

function EventRow({
  event,
  index,
  claimed,
  past,
}: {
  event: EventItem;
  index: number;
  claimed: boolean;
  past?: boolean;
}) {
  return (
    <li
      className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 border-b border-border motion-reduce:animate-none"
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
    >
      <Link
        href={`/${event.slug}`}
        className={cn(
          "group flex items-center gap-6 px-2 py-7 transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 sm:gap-10 sm:px-4",
          past && "opacity-60 transition-opacity hover:opacity-100",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-heading text-xl font-medium tracking-tight sm:text-2xl">
            {event.name}
            {claimed ? (
              <Badge variant="secondary" className="gap-1">
                <BadgeCheck data-icon="inline-start" />
                Claimed
              </Badge>
            ) : null}
          </div>
          {event.description ? (
            <p className="mt-1.5 line-clamp-1 text-sm text-muted-foreground">
              {event.description}
            </p>
          ) : null}
        </div>
        {event.eventDate ? (
          <span className="hidden shrink-0 text-xs text-muted-dim tabular-nums sm:inline">
            {formatEventDate(event.eventDate)}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

export default function Home() {
  const events = useQuery(api.events.list);
  const { isAuthenticated } = useConvexAuth();
  const mine = useQuery(api.codes.mine, isAuthenticated ? {} : "skip");
  const claimedEventIds = new Set(
    mine?.map((item) => item.event?._id).filter(Boolean) ?? [],
  );

  // Dated events that have passed sink into their own dimmed group; undated
  // events are treated as current. Active events order soonest-first, with
  // undated ones following in their arrival (newest created) order; past
  // events list the most recently ended first. YYYY-MM-DD compares correctly
  // as a plain string, so no date parsing is needed.
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
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        {/* Typographic hero on a strict two-column grid: a red index mark and
            eyebrow on the rule line, an oversized flush-left grotesque
            headline, and the supporting line seated in the right column. */}
        <section className="border-b border-border">
          <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
            <div className="flex items-baseline justify-between border-b border-border pt-14 pb-4 sm:pt-20">
              <p className="eyebrow text-muted-foreground">
                {process.env.NEXT_PUBLIC_IS_DEVIN ? "Devin " : ""}Event credit
                distribution
              </p>
              <span
                className="size-2 shrink-0 bg-brand"
                aria-hidden
              />
            </div>
            <div className="grid gap-10 py-14 sm:grid-cols-12 sm:py-20">
              <h1 className="font-heading text-5xl leading-[0.95] font-bold tracking-[-0.04em] text-balance sm:col-span-8 sm:text-7xl">
                Claim your credits.
              </h1>
              <p className="self-end text-sm leading-relaxed text-muted-foreground sm:col-span-4">
                Sign in, then select your event to claim your credits.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-sm font-medium text-muted-foreground">
            Active events
          </h2>

          {events === undefined ? (
            <div
              className="mt-4 border-t border-border"
              role="status"
              aria-label="Loading active events"
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-6 border-b border-border px-2 py-7 sm:gap-10 sm:px-4"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className="h-5 w-2/3 rounded-sm" />
                    <Skeleton className="h-3 w-1/2 rounded-sm" />
                  </div>
                </div>
              ))}
            </div>
          ) : events.length === 0 ? (
            <Empty className="mt-6 border border-dashed border-border-strong py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Ticket />
                </EmptyMedia>
                <EmptyTitle>Nothing to dispense yet</EmptyTitle>
                <EmptyDescription>
                  Events will appear here as soon as they open.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              {current.length === 0 ? (
                <p className="mt-6 text-sm text-muted-foreground">
                  No active events right now.
                </p>
              ) : (
                <ul className="mt-4 border-t border-border">
                  {current.map((event, index) => (
                    <EventRow
                      key={event._id}
                      event={event}
                      index={index}
                      claimed={claimedEventIds.has(event._id)}
                    />
                  ))}
                </ul>
              )}
              {past.length > 0 ? (
                <>
                  <div className="mt-14 flex items-baseline justify-between">
                    <h2 className="text-sm font-medium text-muted-foreground">
                      Past events
                    </h2>
                    <span className="font-mono text-xs text-muted-dim tabular-nums">
                      {String(past.length).padStart(2, "0")}
                    </span>
                  </div>
                  <ul className="mt-4 border-t border-border">
                    {past.map((event, index) => (
                      <EventRow
                        key={event._id}
                        event={event}
                        index={index}
                        claimed={claimedEventIds.has(event._id)}
                        past
                      />
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
