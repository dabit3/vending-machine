"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Copy,
  LogIn,
  OctagonX,
  QrCode,
  SearchX,
  Undo2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { SignInButton, SignOutButton, useUser } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import {
  daysUntilEvent,
  eventCountdownLabel,
  formatEventDate,
} from "@/lib/event-date";
import { copyText } from "@/lib/clipboard";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
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
      codeType?: string;
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

export default function ClaimPage({ slug }: { slug: string }) {
  const event = useQuery(api.events.getBySlug, { slug });
  const claim = useMutation(api.claims.claim);
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const { user } = useUser();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const origin = useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => "",
  );

  const signedInEmail = user?.primaryEmailAddress?.emailAddress;

  // Two named pools means the user picks which one to draw from; a single
  // (possibly unnamed) pool claims without a choice.
  const codeTypes = (event?.codeTypes ?? []).filter((t) => t !== "");
  const mustChoose = (event?.codeTypes.length ?? 0) > 1;

  async function handleClaim() {
    setSubmitting(true);
    setResult(null);
    try {
      const res = await claim({
        slug,
        codeType: mustChoose && selectedType ? selectedType : undefined,
      });
      setResult(res);
    } catch {
      setResult({ ok: false, error: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  async function copyCode(code: string) {
    const ok = await copyText(code);
    if (!ok) {
      toast.error("Couldn't copy automatically", {
        description: "Select the code and copy it manually.",
      });
      return;
    }
    setCopied(true);
    toast.success("Code copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main
        id="main-content"
        className="relative flex flex-1 items-center justify-center px-4 py-10 sm:px-6 sm:py-16"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-dotgrid [mask-image:radial-gradient(ellipse_60%_60%_at_50%_45%,black,transparent)]"
        />
        <div className="relative w-full max-w-md">
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
              codeType={result.codeType}
              alreadyClaimed={result.alreadyClaimed}
              copied={copied}
              onCopy={copyCode}
            />
          ) : (
            <div className="perspective-distant">
              <div
                className={cn(
                  "grid transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] transform-3d motion-reduce:transition-none",
                  showQr && "rotate-y-180",
                )}
              >
            <Card
              inert={showQr || undefined}
              className="gap-0 py-0 backface-hidden [grid-area:1/1] [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]"
            >
              <CardHeader className="gap-4 pt-(--card-spacing)">
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
                {event.eventDate ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    {event.eventDate ? (
                      <span className="flex items-center gap-1.5 tabular-nums">
                        <CalendarDays className="size-3.5" aria-hidden />
                        {formatEventDate(event.eventDate)}
                        {eventCountdownLabel(event.eventDate) ? (
                          daysUntilEvent(event.eventDate) === 0 ? (
                            <Badge variant="secondary" className="gap-1.5">
                              <span
                                className="size-1.5 animate-pulse rounded-full bg-brand motion-reduce:animate-none"
                                aria-hidden
                              />
                              Live now
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              {eventCountdownLabel(event.eventDate)}
                            </Badge>
                          )
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                ) : null}
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
                    {event.soldOut ? (
                      <p className="text-center text-xs text-muted-foreground">
                        All codes have been dispensed — if you already claimed,
                        yours is still here.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex flex-col gap-5">
                    {result && !result.ok ? (
                      <Alert variant="destructive">
                        <OctagonX />
                        <AlertTitle>{result.error}</AlertTitle>
                      </Alert>
                    ) : null}
                    {mustChoose ? (
                      <fieldset className="flex flex-col gap-2">
                        <legend className="mb-2 text-xs font-medium text-muted-foreground">
                          Choose your code type
                        </legend>
                        <div className="grid grid-cols-2 gap-2">
                          {codeTypes.map((type) => (
                            <Button
                              key={type}
                              type="button"
                              variant="outline"
                              aria-pressed={selectedType === type}
                              onClick={() => setSelectedType(type)}
                              className={cn(
                                "h-auto min-h-10 whitespace-normal py-2",
                                selectedType === type &&
                                  "border-brand ring-1 ring-brand",
                              )}
                            >
                              {type}
                            </Button>
                          ))}
                        </div>
                      </fieldset>
                    ) : null}
                    <Button
                      variant="brand"
                      size="lg"
                      disabled={submitting || (mustChoose && !selectedType)}
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
                    {event.soldOut ? (
                      <p className="text-center text-xs text-muted-foreground">
                        All codes have been dispensed — if you already claimed,
                        yours is still here.
                      </p>
                    ) : null}
                    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span className="min-w-0 truncate">
                        Signed in as{" "}
                        <span className="text-foreground">
                          {signedInEmail ?? "verified user"}
                        </span>
                      </span>
                      <SignOutButton redirectUrl={`/${slug}`}>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="shrink-0 text-muted-foreground"
                        >
                          Switch
                        </Button>
                      </SignOutButton>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            <QrPanel
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

function QrPanel({
  eventName,
  url,
  onBack,
  hidden,
}: {
  eventName: string;
  url: string;
  onBack: () => void;
  hidden: boolean;
}) {
  return (
    <Card
      inert={hidden || undefined}
      className="gap-0 rotate-y-180 py-0 backface-hidden [grid-area:1/1] [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]"
    >
      <CardHeader className="gap-2 pt-(--card-spacing)">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <span className="eyebrow text-muted-foreground">Scan to claim</span>
            <CardTitle className="font-heading text-2xl font-semibold tracking-[-0.02em] text-balance">
              {eventName}
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="-mt-1 -mr-2 shrink-0 text-muted-foreground"
            onClick={onBack}
            aria-label="Back to claim form"
            title="Back to claim form"
          >
            <Undo2 />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center justify-center gap-5 py-(--card-spacing)">
        <div className="rounded-lg border border-border bg-background p-4 text-foreground">
          {url ? (
            <QRCodeSVG
              value={url}
              size={208}
              marginSize={0}
              fgColor="currentColor"
              bgColor="transparent"
              aria-label={`QR code linking to ${url}`}
            />
          ) : (
            <Skeleton className="size-[208px]" />
          )}
        </div>
        <span className="max-w-full truncate text-xs text-muted-foreground">
          {url ? url.replace(/^https?:\/\//, "") : "\u00A0"}
        </span>
      </CardContent>
    </Card>
  );
}

function Receipt({
  eventName,
  creditAmount,
  code,
  codeType,
  alreadyClaimed,
  copied,
  onCopy,
}: {
  eventName: string;
  creditAmount?: string;
  code: string;
  codeType?: string;
  alreadyClaimed: boolean;
  copied: boolean;
  onCopy: (code: string) => void;
}) {
  return (
    <div
      className="receipt-edge receipt-print rounded-t-xl border border-border bg-surface pb-10 motion-reduce:animate-none"
      role="status"
    >
      <div className="flex flex-col gap-6 p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <span className="eyebrow text-muted-foreground">
            Code dispensed
          </span>
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60 motion-reduce:animate-none [animation-duration:2.5s] [animation-iteration-count:3]" />
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
          <Badge
            variant="secondary"
            className="animate-in fade-in fill-mode-both duration-500 delay-200 self-start motion-reduce:animate-none"
          >
            Already claimed — here it is again
          </Badge>
        ) : null}

        <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 delay-300 py-2 motion-reduce:animate-none">
          <div className="text-xs text-muted-dim">
            {codeType ? `Your “${codeType}” code` : "Your credit code"}
          </div>
          <div className="mt-2 font-mono text-3xl font-medium tracking-[0.06em] break-all select-all sm:text-4xl">
            {code}
          </div>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 delay-[450ms] flex flex-col gap-2 motion-reduce:animate-none">
          <Button variant="brand" size="lg" onClick={() => onCopy(code)}>
            {copied ? (
              <>
                <Check
                  data-icon="inline-start"
                  className="animate-in zoom-in-50 duration-200 motion-reduce:animate-none"
                />
                Copied
              </>
            ) : (
              <>
                <Copy data-icon="inline-start" />
                Copy code
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="self-center text-muted-foreground"
            render={<Link href="/my-codes" />}
            nativeButton={false}
          >
            View all my codes
            <ArrowUpRight data-icon="inline-end" aria-hidden />
          </Button>
        </div>

        <div
          aria-hidden
          className="animate-in fade-in fill-mode-both duration-500 delay-[550ms] flex items-center gap-4 pt-2 motion-reduce:animate-none"
        >
          <div className="h-6 flex-1 bg-[repeating-linear-gradient(90deg,var(--color-border-strong)_0_2px,transparent_2px_5px,var(--color-border-strong)_5px_6px,transparent_6px_11px)]" />
          <span className="shrink-0 font-mono text-[10px] text-muted-dim">
            NO.{code.slice(-4).toUpperCase().padStart(4, "0")}
          </span>
        </div>
      </div>
    </div>
  );
}
