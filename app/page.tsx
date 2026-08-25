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
import { getAppName } from "@/lib/app-name";

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
          "group flex items-baseline gap-5 py-6 transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 sm:gap-8",
          past && "opacity-60 transition-opacity hover:opacity-100",
        )}
      >
        <span
          className="hidden w-8 shrink-0 font-heading text-lg tabular-nums text-muted-dim sm:inline"
          aria-hidden
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-heading text-2xl font-medium tracking-tight text-balance sm:text-3xl">
            {event.name}
            {claimed ? (
              <Badge variant="secondary" className="gap-1 align-middle">
                <BadgeCheck data-icon="inline-start" />
                Claimed
              </Badge>
            ) : null}
          </div>
          {event.description ? (
            <p className="mt-1.5 line-clamp-1 font-serif text-sm leading-relaxed text-muted-foreground">
              {event.description}
            </p>
          ) : null}
        </div>
        {event.eventDate ? (
          <span className="eyebrow hidden shrink-0 text-muted-dim tabular-nums sm:inline">
            {formatEventDate(event.eventDate)}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function SectionHeading({
  label,
  count,
}: {
  label: string;
  count?: number;
}) {
  return (
    <div className="rule-double flex items-baseline justify-between border-b border-border pt-2 pb-2">
      <h2 className="eyebrow text-foreground">{label}</h2>
      {count !== undefined ? (
        <span className="font-mono text-xs text-muted-dim tabular-nums">
          No. {String(count).padStart(2, "0")}
        </span>
      ) : null}
    </div>
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
        {/* Masthead: a broadsheet front page — dateline row between rules,
            display-serif headline, and an italic deck set as a pull quote. */}
        <section className="border-b border-border">
          <div className="mx-auto w-full max-w-4xl px-6 pt-12 sm:px-8 sm:pt-16">
            <div className="rule-masthead flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 pt-3 pb-3">
              <span className="eyebrow text-muted-foreground">
                {process.env.NEXT_PUBLIC_IS_DEVIN ? "Devin " : ""}Event credit
                distribution
              </span>
              <span className="eyebrow text-muted-dim">
                {getAppName()} — Vol. I
              </span>
            </div>
            <div className="border-t border-border pt-10 pb-12 sm:pt-14 sm:pb-16">
              <h1 className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 max-w-3xl font-heading text-6xl leading-[1.02] font-semibold tracking-tight text-balance motion-reduce:animate-none sm:text-8xl">
                Claim your credits.
              </h1>
              <p className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 delay-150 pull-quote mt-10 max-w-md pl-5 text-lg leading-relaxed text-muted-foreground motion-reduce:animate-none sm:text-xl">
                Sign in, then select your event to claim your credits.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-4xl px-6 py-14 sm:px-8 sm:py-20">
          <SectionHeading label="Active events" count={current.length || undefined} />

          {events === undefined ? (
            <div role="status" aria-label="Loading active events">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-6 border-b border-border py-6 sm:gap-10"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className="h-6 w-2/3 rounded-sm" />
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
                <EmptyTitle className="font-heading tracking-tight">
                  Nothing to dispense yet
                </EmptyTitle>
                <EmptyDescription className="font-serif">
                  Events will appear here as soon as they open.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              {current.length === 0 ? (
                <p className="mt-6 font-serif text-sm italic text-muted-foreground">
                  No active events right now.
                </p>
              ) : (
                <ul>
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
                <div className="mt-16">
                  <SectionHeading label="Past events" count={past.length} />
                  <ul>
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
                </div>
              ) : null}
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
