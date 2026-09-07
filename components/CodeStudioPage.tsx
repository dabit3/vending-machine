"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft, Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import CodeBlockLibrary from "@/components/CodeBlockLibrary";
import StripeBatchDetails from "@/components/StripeBatchDetails";
import StripeCodeStudio from "@/components/StripeCodeStudio";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function CodeStudioPage({
  eventId,
  batchId,
  mode = "library",
}: {
  eventId?: string;
  batchId?: string;
  mode?: "library" | "create";
}) {
  const events = useQuery(api.events.listManaged, eventId ? {} : "skip");
  const event = events?.find((event) => event._id === eventId);
  const creating = mode === "create" || (!!eventId && !batchId);
  const selectedBatchId =
    batchId && /^[a-z0-9]{32}$/.test(batchId)
      ? (batchId as Id<"stripeBatches">)
      : null;
  if (eventId && events === undefined) return <Skeleton className="h-64" />;
  if (creating && eventId && !event)
    return (
      <Alert>
        <AlertTitle>Event not found.</AlertTitle>
      </Alert>
    );

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        {(creating || batchId || event) && (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/codes"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <ArrowLeft data-icon="inline-start" />
              All code blocks
            </Link>
            {event && (
              <Link
                href={`/admin/events/${event._id}`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Back to event
              </Link>
            )}
          </div>
        )}
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div className="flex flex-col items-start gap-3">
            <Badge variant="outline">System admins only</Badge>
            <h1 className="font-heading text-3xl font-semibold tracking-tight">
              {creating
                ? "New code block"
                : batchId
                  ? "Saved code block"
                  : "Code blocks"}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {creating
                ? event
                  ? `Generate codes for “${event.name}”, or add an existing saved block.`
                  : "Generate and save Stripe codes now. You do not need to create an event."
                : batchId
                  ? "View every saved code, download a CSV, or assign this block to an event."
                  : "Your shared library of Stripe code blocks. Create blocks independently, then use them in events when you need them."}
            </p>
          </div>
          {!creating && (
            <Link href="/admin/codes/new" className={buttonVariants()}>
              <Plus data-icon="inline-start" />
              New code block
            </Link>
          )}
        </div>
      </header>
      {creating ? (
        <StripeCodeStudio
          key={event?._id ?? "standalone"}
          eventId={event?._id}
          eventName={event?.name}
        />
      ) : selectedBatchId ? (
        <div className="mx-auto w-full max-w-3xl">
          <StripeBatchDetails
            key={selectedBatchId}
            batchId={selectedBatchId}
            targetEventId={event?._id}
          />
        </div>
      ) : batchId ? (
        <Alert>
          <AlertTitle>Code block not found.</AlertTitle>
        </Alert>
      ) : (
        <CodeBlockLibrary />
      )}
    </div>
  );
}
