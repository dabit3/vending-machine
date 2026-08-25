"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { BadgeCheck, Ticket } from "lucide-react";
import { useTheme } from "next-themes";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { daysUntilEvent, formatEventDate } from "@/lib/event-date";
import UnicornSceneEmbed from "@/components/UnicornSceneEmbed";
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

// The hero background is a theme-paired Unicorn Studio WebGL scene
// (experiment). A Unicorn project publishes exactly one authored design and
// the SDK has no color-scheme awareness, so a light-authored project shows
// its light design in dark mode too — each theme therefore needs its own
// project ID here.
const UNICORN_PROJECTS = {
  light: "wEz2vCJgsynwCYSb3HgR",
  dark: "aEdLurlqLEmU1DUjAaUz",
} as const;

// Bump this whenever a scene is republished in Unicorn Studio. Deployed
// builds read scene data through Unicorn's CDN, which caches for months and
// doesn't reliably purge on republish; the update param below is part of the
// CDN cache key, so bumping the version makes deploys fetch the new design.
// Dev skips the param (and the CDN): without it the SDK cache-busts every
// load, so republishes show up on a plain refresh.
const UNICORN_CACHE_VERSION = 2;

const isProdBuild = process.env.NODE_ENV === "production";

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
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-heading text-2xl font-medium tracking-tight sm:text-3xl">
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

  // The scene choice needs JS (the server doesn't know the theme, while the
  // hydration render already does), so gate it behind hydration to keep both
  // trees identical; the copy and scrim flip with pure dark: variants and
  // render correctly from the first paint. Until hydration the plain
  // theme-tinted shell stands in for both themes.
  const { resolvedTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const heroProjectId = hydrated
    ? resolvedTheme === "light"
      ? UNICORN_PROJECTS.light
      : UNICORN_PROJECTS.dark
    : undefined;

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

  // Shared hero copy: crisp DOM stacked above the theme's scene. pt-15.25
  // offsets the translucent header bar the hero slides under, keeping the
  // copy centered in the visible area.
  const heroCopy = (
    <div className="relative mx-auto flex h-full w-full max-w-5xl flex-col justify-center px-4 pt-15.25 sm:px-6">
      <p className="eyebrow animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 text-brand motion-reduce:animate-none">
        {process.env.NEXT_PUBLIC_IS_DEVIN ? "Devin " : ""}Event credit
        distribution
      </p>
      <h1 className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 delay-100 mt-6 max-w-2xl font-heading text-6xl leading-[0.98] font-medium tracking-[-0.01em] text-balance text-black dark:text-white motion-reduce:animate-none sm:text-8xl">
        Claim your credits.
      </h1>
      <p className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 delay-200 mt-6 max-w-md text-sm leading-relaxed text-black/70 dark:text-white/70 motion-reduce:animate-none">
        Sign in, then select your event to claim your credits.
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
              hero is 61px taller to compensate and the scene shows through
              the bar's frosted fill. The theme's Unicorn Studio scene renders
              behind the copy and a soft theme-matched scrim; keying the scene
              by project swaps it cleanly on theme change while the copy stays
              mounted. The scene's mouse interactivity listens on window, so
              the copy sitting above it doesn't block it. */}
          <div className="relative h-[520px] overflow-hidden bg-background dark:bg-[#0b0a07] sm:h-[486px]">
            {heroProjectId ? (
              <div className="absolute inset-0" aria-hidden>
                {/* Dev fetches fresh scene data on every load; deploys pin
                    the CDN to UNICORN_CACHE_VERSION — see the constant. */}
                <UnicornSceneEmbed
                  key={heroProjectId}
                  projectId={
                    isProdBuild
                      ? `${heroProjectId}?update=${UNICORN_CACHE_VERSION}`
                      : heroProjectId
                  }
                  production={isProdBuild}
                />
              </div>
            ) : null}
            {/* Soft scrim keeps the headline legible over the scenes; tune
                or remove once the look settles. */}
            <div
              className="absolute inset-0 bg-white/20 dark:bg-black/20"
              aria-hidden
            />
            {heroCopy}
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="eyebrow text-brand">Active events</h2>

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
                    <h2 className="eyebrow text-muted-dim">Past events</h2>
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
