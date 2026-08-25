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

// ASCII masthead for the hero — rendered in a <pre> so the terminal owns
// the top of the page. Hidden from screen readers; the h1 carries meaning.
const ASCII_MASTHEAD = String.raw`
 █▀▀ █▀▀█ █▀▀ █▀▀█ █▀▀█ █▀▀█ ▀█▀ ▀█▀ █▀▀█
 █   █▄▄▀ █▀▀ █  █ █  █ █▄▄█  █   █  █  █
 ▀▀▀ ▀ ▀▀ ▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀  ▀  ▀  ▀▀▀ ▀▀▀▀`;

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
            <span
              aria-hidden
              className="text-phosphor-dim opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              &gt;
            </span>
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

  // Terminal boot-screen hero: ASCII masthead, a shell prompt line, and the
  // headline typed out behind a blinking block cursor. pt-15.25 offsets the
  // translucent header bar the hero slides under.
  const heroCopy = (
    <div className="relative mx-auto flex h-full w-full max-w-5xl flex-col justify-center px-4 pt-15.25 sm:px-6">
      <pre
        aria-hidden
        className="crt-flicker phosphor-glow-soft hidden select-none text-[9px] leading-[1.15] text-phosphor-dim motion-reduce:animate-none sm:block sm:text-[11px]"
      >
        {ASCII_MASTHEAD}
      </pre>
      <p className="eyebrow animate-in fade-in fill-mode-both duration-500 mt-6 text-muted-foreground motion-reduce:animate-none">
        <span aria-hidden className="text-phosphor-dim">$ </span>
        ./vend --{process.env.NEXT_PUBLIC_IS_DEVIN ? "devin " : ""}event-credit-distribution
      </p>
      <h1 className="animate-in fade-in fill-mode-both duration-500 delay-100 terminal-cursor phosphor-glow mt-6 max-w-2xl font-heading text-4xl leading-[1.05] font-semibold tracking-tight text-balance text-foreground uppercase motion-reduce:animate-none sm:text-6xl">
        Claim your credits.
      </h1>
      <p className="animate-in fade-in fill-mode-both duration-500 delay-200 mt-6 max-w-md text-sm leading-relaxed text-muted-foreground motion-reduce:animate-none">
        <span aria-hidden className="text-phosphor-dim">&gt; </span>
        Sign in, then select your event to claim your credits.
      </p>
      <p className="animate-in fade-in fill-mode-both duration-500 delay-300 mt-2 text-xs text-muted-dim motion-reduce:animate-none">
        <span aria-hidden className="text-phosphor-dim">&gt; </span>
        READY.
      </p>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <section className="-mt-15.25 border-b border-border/65">
          {/* The section pulls up behind the translucent header bar
              (-mt-15.25) so the background runs to the top of the page; the
              hero is 61px taller to compensate. A faint dot grid stands in
              for CRT phosphor texture behind the boot copy. */}
          <div className="relative h-[520px] overflow-hidden bg-background sm:h-[486px]">
            <div
              aria-hidden
              className="absolute inset-0 bg-dotgrid [mask-image:radial-gradient(ellipse_70%_70%_at_50%_50%,black,transparent)]"
            />
            {heroCopy}
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="eyebrow text-muted-foreground">
            <span aria-hidden className="text-phosphor-dim">$ </span>ls
            ./active-events
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
                    <h2 className="eyebrow text-muted-foreground">
                      <span aria-hidden className="text-phosphor-dim">$ </span>
                      ls ./past-events
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
