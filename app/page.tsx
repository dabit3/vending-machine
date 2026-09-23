"use client";

import Link from "next/link";
import { ArrowUpRight, LogIn, Ticket } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { SignInButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewerAuth } from "@/lib/use-viewer-auth";
import { daysUntilEvent, formatEventDate } from "@/lib/event-date";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { APP_URL, getAppName } from "@/lib/app-name";

// Hero call-to-action: larger than the stock `lg` button, and full-width
// with a taller tap target on phones.
const HERO_BUTTON =
  "h-12 w-full gap-2 px-5 text-base has-data-[icon=inline-start]:pl-4 sm:h-11 sm:w-auto sm:px-4.5 sm:text-[15px] sm:has-data-[icon=inline-start]:pl-3.5 [&_svg:not([class*='size-'])]:size-4.5";

interface EventItem {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  eventDate?: string;
  claimed: boolean;
}

// Events are never listed publicly: attendees arrive through the claim URL or
// QR code their organizer shares. The page introduces the app to visitors and,
// once someone signs in, lists the events their email is eligible for.
export default function Home() {
  const { authReady, signedIn, canQuery } = useViewerAuth();
  const mine = useQuery(api.events.mine, canQuery ? {} : "skip");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader width="wide" showSignIn={false} />
      <main
        id="main-content"
        className="mx-auto grid w-full max-w-6xl flex-1 lg:grid-cols-2"
      >
        <section className="flex flex-col justify-center px-4 py-14 sm:px-6 lg:py-20 lg:pr-12">
          <p className="eyebrow animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 text-muted-foreground motion-reduce:animate-none">
            {process.env.NEXT_PUBLIC_IS_DEVIN ? "Devin " : ""}Event credit
            distribution
          </p>
          <h1 className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 delay-100 mt-6 font-heading text-5xl leading-[0.98] font-semibold tracking-[-0.03em] text-balance motion-reduce:animate-none sm:text-6xl lg:text-7xl">
            {getAppName()}
          </h1>
          {!authReady ? (
            <div
              className="mt-5 flex max-w-md flex-col gap-2.5"
              role="status"
              aria-label="Checking sign-in"
            >
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="mt-4 h-12 w-full rounded-md sm:h-11 sm:w-32" />
            </div>
          ) : signedIn ? (
            <>
              <p className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 delay-200 mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground motion-reduce:animate-none">
                Welcome back. You&apos;re eligible for the events listed here.
                Open one to claim, or revisit anything you&apos;ve already
                claimed.
              </p>
              <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 delay-300 mt-8 flex flex-wrap items-center gap-2.5 motion-reduce:animate-none">
                <Link
                  href="/my-codes"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    HERO_BUTTON,
                  )}
                >
                  <Ticket data-icon="inline-start" />
                  My codes
                </Link>
              </div>
              <p className="mt-7 text-xs text-muted-dim">
                Not seeing your event? Contact the event organizer.
              </p>
            </>
          ) : (
            <>
              <p className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 delay-200 mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground motion-reduce:animate-none">
                Sign in to claim your credits.
              </p>
              <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 delay-300 mt-8 flex flex-wrap items-center gap-2.5 motion-reduce:animate-none">
                <SignInButton mode="modal">
                  <Button variant="brand" size="lg" className={HERO_BUTTON}>
                    <LogIn data-icon="inline-start" />
                    Sign in
                  </Button>
                </SignInButton>
              </div>
            </>
          )}
        </section>

        <section
          className="relative flex items-center justify-center overflow-hidden border-t border-border/65 px-4 py-12 sm:px-6 lg:border-t-0 lg:border-l lg:py-16"
          aria-label={signedIn ? "Your events" : "How to claim"}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-dotgrid [mask-image:radial-gradient(ellipse_70%_70%_at_50%_50%,black,transparent)]"
          />
          {signedIn || !authReady ? (
            <YourEvents events={signedIn ? mine : undefined} />
          ) : (
            <div className="relative w-[300px] max-w-full rounded-2xl bg-card p-6 text-center shadow-(--shadow-card) ring-1 ring-foreground/10">
              <div className="rounded-lg bg-white p-3">
                <QRCodeSVG
                  value={APP_URL}
                  size={228}
                  marginSize={0}
                  fgColor="#000000"
                  bgColor="#ffffff"
                  className="size-full"
                  aria-label={`QR code linking to ${APP_URL}`}
                />
              </div>
              <p className="eyebrow mt-4 text-muted-foreground">Scan to claim</p>
              <p className="mt-1.5 text-[13px] font-medium">
                Your event&apos;s QR code, at the venue
              </p>
            </div>
          )}
        </section>
      </main>
      <SiteFooter width="wide" />
    </div>
  );
}

function YourEvents({ events }: { events: EventItem[] | null | undefined }) {
  if (events === undefined) {
    return (
      <div
        className="relative grid w-full max-w-md gap-3"
        role="status"
        aria-label="Loading your events"
      >
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[74px] rounded-xl" />
        ))}
      </div>
    );
  }
  if (events === null) {
    return (
      <Alert variant="destructive" className="relative max-w-md">
        <AlertTitle>
          Your account needs a verified email address to see your events.
        </AlertTitle>
      </Alert>
    );
  }
  if (events.length === 0) {
    return (
      <Empty className="relative w-full max-w-md border border-dashed border-border-strong bg-background/60 py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Ticket />
          </EmptyMedia>
          <EmptyTitle>No events yet</EmptyTitle>
          <EmptyDescription>
            Events you&apos;re eligible for will show up here. Open the link or
            scan the QR code from your organizer to get started.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="relative grid w-full max-w-md gap-3">
      <h2 className="px-1 text-sm font-medium text-muted-foreground">
        Your events
      </h2>
      <ul className="grid min-w-0 gap-3">
        {events.map((event, index) => (
          <EventCard key={event._id} event={event} index={index} />
        ))}
      </ul>
    </div>
  );
}

function EventCard({ event, index }: { event: EventItem; index: number }) {
  const past = event.eventDate ? daysUntilEvent(event.eventDate) < 0 : false;
  return (
    <li
      className="min-w-0 animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 motion-reduce:animate-none"
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
    >
      <Link
        href={`/${event.slug}`}
        className={cn(
          "group flex items-center justify-between gap-4 rounded-xl bg-card px-5 py-4 text-sm shadow-(--shadow-card) ring-1 ring-foreground/10 transition-[box-shadow,color] hover:ring-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          past && "opacity-70 hover:opacity-100 focus-visible:opacity-100",
        )}
      >
        <span className="min-w-0">
          <span className="block truncate font-heading text-base font-medium tracking-tight">
            {event.name}
          </span>
          {event.eventDate || event.description ? (
            <span className="mt-1 block truncate text-xs text-muted-dim">
              {event.eventDate ? (
                <time dateTime={event.eventDate} className="tabular-nums">
                  {formatEventDate(event.eventDate)}
                </time>
              ) : null}
              {event.eventDate && event.description ? " · " : null}
              {event.description}
            </span>
          ) : null}
        </span>
        {event.claimed ? (
          <Badge variant="secondary" className="shrink-0">
            Claimed
          </Badge>
        ) : (
          <ArrowUpRight
            className="size-4 shrink-0 text-muted-dim transition-colors group-hover:text-foreground"
            aria-hidden
          />
        )}
      </Link>
    </li>
  );
}
