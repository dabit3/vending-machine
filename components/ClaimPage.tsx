"use client";

import { useState, useSyncExternalStore } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  Check,
  Copy,
  LogIn,
  OctagonX,
  QrCode,
  SearchX,
} from "lucide-react";
import { toast } from "sonner";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { SignInButton, SignOutButton, useUser } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { eventCountdownLabel, formatEventDate } from "@/lib/event-date";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import EventQrPanel from "@/components/EventQrPanel";
import { CodeDisplay } from "@/components/CodeDisplay";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type ClaimResult =
  | {
      ok: true;
      code: string;
      alreadyClaimed: boolean;
      creditAmount?: string;
    }
  | { ok: false; error: string };

// creditAmount is free text; prefix "$" only when it starts with a number
// so already-prefixed values ("$100") or other currencies stay untouched.
function formatCredits(amount: string) {
  const trimmed = amount.trim();
  return /^\d/.test(trimmed) ? `$${trimmed}` : trimmed;
}

function subscribeNoop() {
  return () => {};
}

function urlLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function ClaimPage({ slug }: { slug: string }) {
  const event = useQuery(api.events.getBySlug, { slug });
  const claim = useMutation(api.claims.claim);
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const { user } = useUser();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const origin = useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => "",
  );

  const signedInEmail = user?.primaryEmailAddress?.emailAddress;

  async function handleClaim() {
    setSubmitting(true);
    setResult(null);
    try {
      const res = await claim({ slug });
      setResult(res);
    } catch {
      setResult({ ok: false, error: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Code copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main
        id="main-content"
        className="flex flex-1 items-center justify-center bg-dotgrid px-4 py-10 sm:px-6 sm:py-16"
      >
        <div className="w-full max-w-md">
          {event === undefined ? (
            <Skeleton className="h-80 rounded-xl" />
          ) : event === null ? (
            <Empty className="border border-dashed border-border-strong py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX />
                </EmptyMedia>
                <EmptyTitle>Event not found</EmptyTitle>
                <EmptyDescription>
                  There is no event at <span className="font-mono">/{slug}</span>.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : result?.ok ? (
            <Receipt
              eventName={event.name}
              creditAmount={result.creditAmount}
              code={result.code}
              alreadyClaimed={result.alreadyClaimed}
              copied={copied}
              onCopy={copyCode}
            />
          ) : (
            <div className="perspective-distant">
              <div
                className={cn(
                  "grid transition-transform duration-700 transform-3d motion-reduce:transition-none",
                  showQr && "rotate-y-180",
                )}
              >
            <Card
              inert={showQr || undefined}
              className="gap-0 py-0 backface-hidden [grid-area:1/1] [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]"
            >
              <CardHeader className="gap-4 border-b border-border py-(--card-spacing)">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="font-heading text-3xl font-semibold tracking-[-0.02em] text-balance">
                    {event.name}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="-mt-1 -mr-2 shrink-0 text-muted-foreground"
                    onClick={() => setShowQr(true)}
                    aria-label="Show event QR code"
                    title="Show event QR code"
                  >
                    <QrCode />
                  </Button>
                </div>
                {event.description ? (
                  <CardDescription className="text-sm leading-relaxed">
                    {event.description}
                  </CardDescription>
                ) : null}
                {event.eventDate || event.eventUrl ? (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    {event.eventDate ? (
                      <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                        <CalendarDays className="size-3.5" aria-hidden />
                        {formatEventDate(event.eventDate)}
                        {eventCountdownLabel(event.eventDate) ? (
                          <Badge variant="secondary">
                            {eventCountdownLabel(event.eventDate)}
                          </Badge>
                        ) : null}
                      </span>
                    ) : null}
                    {event.eventUrl ? (
                      <a
                        href={event.eventUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex w-fit items-center gap-1.5 rounded-sm font-mono text-xs text-muted-foreground transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                      >
                        {urlLabel(event.eventUrl)}
                        <ArrowUpRight
                          className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                          aria-hidden
                        />
                      </a>
                    ) : null}
                  </div>
                ) : null}
                <p className="font-mono text-xs text-muted-foreground">
                  {Math.max(event.codeCount - event.claimedCodeCount, 0)} of{" "}
                  {event.codeCount} codes left
                </p>
              </CardHeader>
              <CardContent className="py-(--card-spacing)">
                {authLoading ? (
                  <div className="flex flex-col gap-3">
                    <Skeleton className="h-12 rounded-md" />
                    <Skeleton className="h-10 rounded-lg" />
                  </div>
                ) : !isAuthenticated ? (
                  <div className="flex flex-col gap-4">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Sign in with the email you registered with — codes are
                      only dispensed to verified addresses.
                    </p>
                    <SignInButton mode="modal">
                      <Button variant="brand" size="lg" className="w-full">
                        <LogIn data-icon="inline-start" />
                        Sign in to claim
                      </Button>
                    </SignInButton>
                  </div>
                ) : (
                  <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <BadgeCheck
                          className="size-4 shrink-0 text-brand"
                          aria-hidden
                        />
                        <span className="truncate font-mono text-sm">
                          {signedInEmail ?? "Signed in"}
                        </span>
                      </span>
                      <SignOutButton redirectUrl={`/${slug}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-muted-foreground"
                        >
                          Switch account
                        </Button>
                      </SignOutButton>
                    </div>
                    {result && !result.ok ? (
                      <Alert variant="destructive">
                        <OctagonX />
                        <AlertTitle>{result.error}</AlertTitle>
                      </Alert>
                    ) : null}
                    <Button
                      variant="brand"
                      size="lg"
                      disabled={submitting}
                      className="w-full"
                      onClick={handleClaim}
                      aria-busy={submitting}
                      aria-live="polite"
                    >
                      {submitting ? (
                        <>
                          <Spinner data-icon="inline-start" />
                          Checking the list...
                        </>
                      ) : (
                        "Dispense my code"
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
            <EventQrPanel
              eventName={event.name}
              url={origin ? `${origin}/${slug}` : ""}
              onBack={() => setShowQr(false)}
              hidden={!showQr}
            />
              </div>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Receipt({
  eventName,
  creditAmount,
  code,
  alreadyClaimed,
  copied,
  onCopy,
}: {
  eventName: string;
  creditAmount?: string;
  code: string;
  alreadyClaimed: boolean;
  copied: boolean;
  onCopy: (code: string) => void;
}) {
  return (
    <div
      className="receipt-edge rounded-t-xl border border-border bg-surface pb-10"
      role="status"
    >
      <div className="flex flex-col gap-6 p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <span className="eyebrow text-muted-foreground">
            Code dispensed
          </span>
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60 motion-reduce:animate-none [animation-duration:2.5s]" />
            <span className="relative inline-flex size-2 rounded-full bg-brand" />
          </span>
        </div>

        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">
            {eventName}
          </h1>
          {creditAmount ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {formatCredits(creditAmount)} in credits
            </p>
          ) : null}
        </div>

        {alreadyClaimed ? (
          <Badge variant="secondary" className="self-start">
            Already claimed — here it is again
          </Badge>
        ) : null}

        <CodeDisplay code={code} label="Your credit code" />

        <Button variant="brand" size="lg" onClick={() => onCopy(code)}>
          {copied ? (
            <>
              <Check data-icon="inline-start" />
              Copied
            </>
          ) : (
            <>
              <Copy data-icon="inline-start" />
              Copy code
            </>
          )}
        </Button>

        <div aria-hidden className="flex flex-col gap-2 pt-2">
          <div className="h-8 w-full bg-[repeating-linear-gradient(90deg,var(--color-border-strong)_0_2px,transparent_2px_5px,var(--color-border-strong)_5px_6px,transparent_6px_11px)]" />
          <div className="flex items-center justify-between">
            <span className="eyebrow text-muted-dim">Keep this somewhere safe</span>
            <span className="font-mono text-[10px] text-muted-dim">
              NO.{code.slice(-4).toUpperCase().padStart(4, "0")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
