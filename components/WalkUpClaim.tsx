"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

function subscribeNoop() {
  return () => {};
}

export default function WalkUpClaim({ id }: { id: Id<"events"> }) {
  const event = useQuery(api.events.get, { id });
  const addEmails = useMutation(api.emails.add);

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [lastAdded, setLastAdded] = useState("");
  const origin = useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => "",
  );

  if (event === undefined) {
    return (
      <div className="mx-auto w-full max-w-md">
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }
  if (event === null) {
    return (
      <Empty className="border border-dashed border-border-strong py-16">
        <EmptyHeader>
          <EmptyDescription>Event not found.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const claimUrl = origin ? `${origin}/${event.slug}` : "";

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const { added, skipped } = await addEmails({
        eventId: id,
        emails: [trimmed],
      });
      if (added === 0 && skipped > 0) {
        toast.info(`${trimmed} is already on the list`, {
          description: "They can scan the code and claim right away.",
        });
      } else {
        toast.success(`${trimmed} can now claim a code`);
      }
      setLastAdded(trimmed);
      setEmail("");
      setShowQr(true);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add email",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div>
        <Button
          variant="ghost"
          size="xs"
          className="-ml-2 text-muted-foreground"
          render={<Link href={`/admin/events/${id}`} />}
          nativeButton={false}
        >
          <ArrowLeft data-icon="inline-start" />
          Manage event
        </Button>
        <h1 className="mt-3 font-heading text-3xl font-semibold tracking-[-0.02em]">
          {event.name}
        </h1>
      </div>

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
            <CardHeader className="gap-2 border-b border-border py-(--card-spacing)">
              <span className="eyebrow text-muted-foreground">
                Walk-up claim
              </span>
              <CardTitle className="font-heading text-2xl font-semibold tracking-[-0.02em]">
                Add an attendee
              </CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                Enter the attendee&apos;s email to make them eligible, then
                flip to the QR code so they can scan and claim.
              </CardDescription>
            </CardHeader>
            <CardContent className="py-(--card-spacing)">
              <form onSubmit={handleAdd} className="flex flex-col gap-4">
                <Input
                  type="email"
                  required
                  aria-label="Attendee email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="attendee@example.com"
                  className="h-12 font-mono text-sm"
                  autoComplete="off"
                />
                <Button
                  type="submit"
                  variant="brand"
                  size="lg"
                  className="w-full"
                  disabled={submitting || !email.trim()}
                  aria-busy={submitting}
                >
                  {submitting ? (
                    <>
                      <Spinner data-icon="inline-start" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <UserPlus data-icon="inline-start" />
                      Add &amp; show QR code
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card
            inert={!showQr || undefined}
            className="gap-0 rotate-y-180 py-0 backface-hidden [grid-area:1/1] [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]"
          >
            <CardHeader className="gap-2 border-b border-border py-(--card-spacing)">
              <span className="eyebrow text-muted-foreground">
                Scan to claim
              </span>
              <CardTitle className="font-heading text-2xl font-semibold tracking-[-0.02em] text-balance">
                {event.name}
              </CardTitle>
              {lastAdded ? (
                <CardDescription className="font-mono text-xs">
                  {lastAdded} is on the list
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-5 py-(--card-spacing)">
              <div className="rounded-lg border border-dashed border-border-strong bg-background p-4 text-foreground">
                {claimUrl ? (
                  <QRCodeSVG
                    value={claimUrl}
                    size={208}
                    marginSize={0}
                    fgColor="currentColor"
                    bgColor="transparent"
                    aria-label={`QR code linking to ${claimUrl}`}
                  />
                ) : (
                  <Skeleton className="size-[208px]" />
                )}
              </div>
              <span className="max-w-full truncate font-mono text-xs text-muted-foreground">
                {claimUrl ? claimUrl.replace(/^https?:\/\//, "") : "\u00A0"}
              </span>
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={() => setShowQr(false)}
              >
                <UserPlus data-icon="inline-start" />
                Add another attendee
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
