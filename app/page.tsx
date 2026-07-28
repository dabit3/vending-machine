"use client";

import Link from "next/link";
import { ArrowUpRight, Ticket } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatEventDate } from "@/lib/event-date";
import SiteHeader from "@/components/SiteHeader";
import DotGridCanvas from "@/components/DotGridCanvas";
import SiteFooter from "@/components/SiteFooter";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

export default function Home() {
  const events = useQuery(api.events.list);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <section className="relative border-b border-border">
          <DotGridCanvas />
          <div className="relative mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
            <p className="eyebrow text-muted-foreground">
              Event credit distribution
            </p>
            <h1 className="mt-6 max-w-2xl font-heading text-5xl leading-[0.95] font-semibold tracking-[-0.03em] text-balance sm:text-7xl">
              Claim your credits<span className="text-brand">.</span>
            </h1>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
              Select your event, enter the email you registered with, and your
              credit code is dispensed on the spot.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-14">
          <div className="flex items-baseline justify-between">
            <h2 className="eyebrow text-muted-foreground">Active events</h2>
            {events ? (
              <span className="font-mono text-xs text-muted-dim tabular-nums">
                {String(events.length).padStart(2, "0")}
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
            <ul className="mt-4 border-t border-border">
              {events.map((event, index) => (
                <li key={event._id} className="border-b border-border">
                  <Link
                    href={`/${event.slug}`}
                    className="group flex items-center gap-6 px-2 py-7 transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 sm:gap-10 sm:px-4"
                  >
                    <span className="font-mono text-xs text-muted-dim tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-heading text-xl font-medium tracking-tight transition-colors group-hover:text-brand sm:text-2xl">
                        {event.name}
                      </div>
                      {event.eventDate ? (
                        <p className="mt-1 font-mono text-xs text-muted-dim tabular-nums">
                          {formatEventDate(event.eventDate)}
                        </p>
                      ) : null}
                      {event.description ? (
                        <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                          {event.description}
                        </p>
                      ) : null}
                    </div>
                    <span className="hidden font-mono text-xs text-muted-dim sm:inline">
                      /{event.slug}
                    </span>
                    <ArrowUpRight
                      className="size-4 shrink-0 text-muted-dim transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
