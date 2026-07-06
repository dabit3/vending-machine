"use client";

import Link from "next/link";
import { ArrowUpRight, Ticket } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import SiteHeader from "@/components/SiteHeader";
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
      <main className="flex-1">
        <section className="border-b border-border bg-dotgrid">
          <div className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
            <p className="eyebrow text-muted-foreground">
              Event credit distribution
            </p>
            <h1 className="mt-6 max-w-2xl font-heading text-6xl font-semibold tracking-[-0.03em] text-balance sm:text-7xl">
              Claim your credits<span className="text-brand">.</span>
            </h1>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
              Select your event, enter the email you registered with, and your
              credit code is dispensed on the spot.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-6 py-14">
          <div className="flex items-baseline justify-between">
            <h2 className="eyebrow text-muted-foreground">Active events</h2>
            {events ? (
              <span className="font-mono text-xs text-muted-dim tabular-nums">
                {String(events.length).padStart(2, "0")}
              </span>
            ) : null}
          </div>

          {events === undefined ? (
            <div className="mt-6 flex flex-col gap-px">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
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
                    className="group flex items-center gap-6 px-2 py-7 transition-colors hover:bg-surface sm:gap-10 sm:px-4"
                  >
                    <span className="font-mono text-xs text-muted-dim tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-heading text-xl font-medium tracking-tight transition-colors group-hover:text-brand sm:text-2xl">
                        {event.name}
                      </div>
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
