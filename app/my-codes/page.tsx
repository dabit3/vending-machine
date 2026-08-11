"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  Copy,
  LogIn,
  Ticket,
} from "lucide-react";
import { toast } from "sonner";
import { SignInButton } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatEventDate } from "@/lib/event-date";
import { copyText } from "@/lib/clipboard";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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

function formatCredits(amount: string) {
  const trimmed = amount.trim();
  return /^\d/.test(trimmed) ? `$${trimmed}` : trimmed;
}

interface EventInfo {
  _id: string;
  name: string;
  slug: string;
  creditAmount?: string;
  eventDate?: string;
}

function eventMeta(event: EventInfo) {
  const parts: string[] = [];
  if (event.eventDate) parts.push(formatEventDate(event.eventDate));
  if (event.creditAmount) parts.push(`${formatCredits(event.creditAmount)} in credits`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// Same grid and card proportions as the loaded state, so the list doesn't
// reflow from a column into three columns once the query lands.
function CodesSkeleton() {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-label="Loading your codes"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6"
        >
          <Skeleton className="h-5 w-2/3 rounded-sm" />
          <Skeleton className="h-4 w-1/2 rounded-sm" />
          <Skeleton className="h-7 w-4/5 rounded-sm" />
          <Skeleton className="h-7 w-20 self-end rounded-md" />
        </div>
      ))}
    </div>
  );
}

export default function MyCodesPage() {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const codes = useQuery(
    api.codes.mine,
    isAuthenticated ? {} : "skip"
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleCopy(id: string, code: string) {
    const ok = await copyText(code);
    if (!ok) {
      toast.error("Couldn't copy automatically", {
        description: "Select the code and copy it manually.",
      });
      return;
    }
    setCopiedId(id);
    toast.success("Code copied to clipboard");
    setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-14">
          <div className="mb-10">
            <h1 className="font-heading text-3xl font-semibold tracking-[-0.02em]">
              My codes
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              All the credit codes you&apos;ve claimed across events.
            </p>
          </div>

          {authLoading ? (
            <CodesSkeleton />
          ) : !isAuthenticated ? (
            <Card className="mx-auto max-w-md">
              <CardHeader>
                <CardTitle>Sign in to see your codes</CardTitle>
                <CardDescription>
                  Codes are tied to your verified email address.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SignInButton mode="modal">
                  <Button variant="brand" size="lg" className="w-full">
                    <LogIn data-icon="inline-start" />
                    Sign in
                  </Button>
                </SignInButton>
              </CardContent>
            </Card>
          ) : codes === undefined ? (
            <CodesSkeleton />
          ) : codes === null ? (
            <Alert variant="destructive" className="max-w-md">
              <AlertTitle>
                Your account needs a verified email address to view claimed codes.
              </AlertTitle>
            </Alert>
          ) : codes.length === 0 ? (
            <Empty className="border border-dashed border-border-strong py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Ticket />
                </EmptyMedia>
                <EmptyTitle>No codes yet</EmptyTitle>
                <EmptyDescription>
                  Codes you claim will appear here.{" "}
                  <Link href="/" className="hover:text-foreground">
                    Browse events
                  </Link>
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {codes.map((item) => {
                const meta = item.event ? eventMeta(item.event) : null;
                return (
                  <Card key={item._id}>
                    <CardHeader>
                      <CardTitle className="font-heading text-base">
                        {item.event ? (
                          <Link
                            href={`/${item.event.slug}`}
                            className="group flex items-center gap-1.5 rounded-sm transition-colors hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                          >
                            {item.event.name}
                            <ArrowUpRight
                              className="size-3.5 text-muted-dim transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground"
                              aria-hidden
                            />
                          </Link>
                        ) : (
                          "Unknown event"
                        )}
                      </CardTitle>
                      {meta ? <CardDescription>{meta}</CardDescription> : null}
                    </CardHeader>
                  <CardContent className="flex-1 pt-2 pb-1">
                    <div className="font-mono text-xl font-medium tracking-[0.04em] break-all select-all">
                      {item.code}
                    </div>
                  </CardContent>
                  <CardFooter className="justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(item._id, item.code)}
                    >
                      {copiedId === item._id ? (
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
                          Copy
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
