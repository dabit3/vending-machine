"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, LogIn, Ticket } from "lucide-react";
import { toast } from "sonner";
import { useConvexAuth, useQuery } from "convex/react";
import { SignInButton } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { formatEventDate } from "@/lib/event-date";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

// creditAmount is free text; prefix "$" only when it starts with a number
// so already-prefixed values ("$100") or other currencies stay untouched.
function formatCredits(amount: string) {
  const trimmed = amount.trim();
  return /^\d/.test(trimmed) ? `$${trimmed}` : trimmed;
}

export default function MyCodesPage() {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const claims = useQuery(api.claims.myClaims, isAuthenticated ? {} : "skip");

  const loading = authLoading || (isAuthenticated && claims === undefined);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <section className="border-b border-border bg-dotgrid">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
            <p className="eyebrow text-muted-foreground">Your credits</p>
            <h1 className="mt-6 max-w-2xl font-heading text-5xl leading-[0.95] font-semibold tracking-[-0.03em] text-balance sm:text-7xl">
              My codes<span className="text-brand">.</span>
            </h1>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
              Every credit code you&apos;ve claimed across events, in one place.
              Copy any of them whenever you need it.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-14">
          <div className="flex items-baseline justify-between">
            <h2 className="eyebrow text-muted-foreground">Claimed codes</h2>
            {claims ? (
              <span className="font-mono text-xs text-muted-dim tabular-nums">
                {String(claims.length).padStart(2, "0")}
              </span>
            ) : null}
          </div>

          {loading ? (
            <div
              className="mt-4 border-t border-border"
              role="status"
              aria-label="Loading your codes"
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
                  <Skeleton className="h-9 w-24 rounded-md" />
                </div>
              ))}
            </div>
          ) : !isAuthenticated ? (
            <Empty className="mt-6 border border-dashed border-border-strong py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LogIn />
                </EmptyMedia>
                <EmptyTitle>Sign in to see your codes</EmptyTitle>
                <EmptyDescription>
                  Sign in with the email you registered with to view every code
                  you&apos;ve claimed.
                </EmptyDescription>
              </EmptyHeader>
              <SignInButton mode="modal">
                <Button variant="brand" size="lg">
                  <LogIn data-icon="inline-start" />
                  Sign in
                </Button>
              </SignInButton>
            </Empty>
          ) : !claims || claims.length === 0 ? (
            <Empty className="mt-6 border border-dashed border-border-strong py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Ticket />
                </EmptyMedia>
                <EmptyTitle>No codes yet</EmptyTitle>
                <EmptyDescription>
                  Codes you claim will show up here. Browse the active events to
                  claim your first one.
                </EmptyDescription>
              </EmptyHeader>
              <Button variant="brand" size="lg" render={<Link href="/" />} nativeButton={false}>
                Browse events
                <ArrowUpRight data-icon="inline-end" />
              </Button>
            </Empty>
          ) : (
            <ul className="mt-4 border-t border-border">
              {claims.map((claim) => (
                <li key={claim._id} className="border-b border-border">
                  <div className="flex flex-col gap-4 px-2 py-6 sm:flex-row sm:items-center sm:gap-10 sm:px-4">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/${claim.eventSlug}`}
                        className="group inline-flex items-center gap-1.5 rounded-sm font-heading text-xl font-medium tracking-tight transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:text-2xl"
                      >
                        {claim.eventName}
                        <ArrowUpRight
                          className="size-4 shrink-0 text-muted-dim transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand"
                          aria-hidden
                        />
                      </Link>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-muted-dim tabular-nums">
                        {claim.creditAmount ? (
                          <span>{formatCredits(claim.creditAmount)} in credits</span>
                        ) : null}
                        {claim.claimedAt ? (
                          <span>
                            Claimed{" "}
                            {new Date(claim.claimedAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        ) : claim.eventDate ? (
                          <span>{formatEventDate(claim.eventDate)}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 sm:shrink-0">
                      <code className="min-w-0 flex-1 truncate rounded-md border border-dashed border-border-strong bg-background px-3 py-2 font-mono text-sm tracking-[0.06em] select-all sm:flex-none">
                        {claim.code}
                      </code>
                      <CopyButton code={claim.code} />
                    </div>
                  </div>
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

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Code copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="shrink-0"
      onClick={handleCopy}
      aria-label={`Copy code for ${code}`}
    >
      {copied ? (
        <>
          <Check data-icon="inline-start" />
          Copied
        </>
      ) : (
        <>
          <Copy data-icon="inline-start" />
          Copy
        </>
      )}
    </Button>
  );
}
