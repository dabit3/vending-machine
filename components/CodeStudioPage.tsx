"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import StripeCodeStudio from "@/components/StripeCodeStudio";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function CodeStudioPage({
  eventId,
  batchId,
}: {
  eventId?: string;
  batchId?: string;
}) {
  const events = useQuery(api.events.listManaged, eventId ? {} : "skip");
  const event = events?.find((event) => event._id === eventId);
  if (eventId && events === undefined) return <Skeleton className="h-64" />;
  if (eventId && !event)
    return (
      <Alert>
        <AlertTitle>Event not found.</AlertTitle>
      </Alert>
    );
  const initialBatchId =
    batchId && /^[a-z0-9]{32}$/.test(batchId)
      ? (batchId as Id<"stripeBatches">)
      : undefined;
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col items-start gap-3">
        {event && (
          <Link
            href={`/admin/events/${event._id}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ArrowLeft data-icon="inline-start" />
            Back to event
          </Link>
        )}
        <Badge variant="outline">System admins only</Badge>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Code studio
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Generate Stripe promotion codes, keep a shared history, and add a
          batch to an event. No spreadsheets required.
        </p>
      </header>
      <StripeCodeStudio
        key={event?._id ?? "standalone"}
        eventId={event?._id}
        eventName={event?.name}
        initialBatchId={initialBatchId}
      />
    </div>
  );
}
