"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowUpRight, BadgeCheck, Ticket } from "lucide-react";
import { useTheme } from "next-themes";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { daysUntilEvent, formatEventDate } from "@/lib/event-date";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import {
  ImageDisplacement,
  type ImageDisplacementOptions,
} from "@/components/canvasui/ImageDisplacement";
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

// The hero wraps a photographic background in the Displacement effect: the
// cursor shears the image into offset, color-fringed cells that relax back.
// The photo is theme-paired — a dark blurred monochrome in dark mode, a pale
// ink-plume wash in light mode — while one motion preset serves both.
const displacementOptions: ImageDisplacementOptions = {
  // threshold 0 removes the speed gate: cells shear on any mouse-over
  // movement, with push strength still scaling naturally with cursor speed.
  grid: 50,
  radius: 0.12,
  strength: 0.12,
  threshold: 0,
  relaxation: 0.92,
  shift: 1,
  aberration: 1.5,
  grain: 0.12,
  scramble: 1,
};

// Stable no-op subscription for the hydration gate below: the snapshot never
// changes on the client, we only care that the server snapshot is false.
const emptySubscribe = () => () => {};

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
        <span className="font-mono text-xs text-muted-dim tabular-nums transition-colors group-hover:text-foreground">
          {String(index + 1).padStart(2, "0")}
        </span>
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
        <ArrowUpRight
          className="size-4 shrink-0 text-muted-dim transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground"
          aria-hidden
        />
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

  // The image source needs JS (the server doesn't know the theme, while the
  // hydration render already does), so gate it behind hydration to keep both
  // trees identical; the copy and scrim flip with pure dark: variants and
  // render correctly from the first paint.
  const { resolvedTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const heroSrc = hydrated
    ? resolvedTheme === "light"
      ? "/hero-displacement-light.jpg"
      : "/hero-displacement-dark.jpg"
    : undefined;

  // Dated events that have passed sink into their own dimmed group; undated
  // events are treated as current.
  const current =
    events?.filter((e) => !e.eventDate || daysUntilEvent(e.eventDate) >= 0) ??
    [];
  const past =
    events?.filter((e) => e.eventDate && daysUntilEvent(e.eventDate) < 0) ?? [];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <section className="border-b border-border">
          {/* The WebGL canvas displaces the photo across the whole hero on
              mouse-over; the copy stays crisp DOM above it. Dark mode pairs
              light copy and a black scrim with the blurred monochrome photo;
              light mode flips to black copy and a white scrim over the
              ink plume. */}
          <ImageDisplacement
            src={heroSrc}
            {...displacementOptions}
            className="h-[459px] bg-background dark:bg-[#131313] sm:h-[425px]"
          >
            <div
              className="absolute inset-0 bg-white/40 dark:bg-black/45"
              aria-hidden
            />
            <div className="relative mx-auto flex h-full w-full max-w-5xl flex-col justify-center px-4 sm:px-6">
              <p className="eyebrow animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 text-black/60 dark:text-white/60 motion-reduce:animate-none">
                Event credit distribution
              </p>
              <h1 className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 delay-100 mt-6 max-w-2xl font-heading text-5xl leading-[0.95] font-semibold tracking-[-0.03em] text-balance text-black dark:text-white motion-reduce:animate-none sm:text-7xl">
                Claim your credits.
              </h1>
              <p className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 delay-200 mt-6 max-w-md text-sm leading-relaxed text-black/70 dark:text-white/70 motion-reduce:animate-none">
                Select your event, enter the email you registered with, and
                your credit code is dispensed on the spot.
              </p>
            </div>
          </ImageDisplacement>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Active events
            </h2>
            {events ? (
              <span className="font-mono text-xs text-muted-dim tabular-nums">
                {String(current.length).padStart(2, "0")}
              </span>
            ) : null}
          </div>

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
                  <Skeleton className="h-3 w-5 rounded-sm" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className="h-5 w-2/3 rounded-sm" />
                    <Skeleton className="h-3 w-1/2 rounded-sm" />
                  </div>
                  <Skeleton className="size-4 rounded-sm" />
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
