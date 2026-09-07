"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Sparkles } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

export default function EventStripeCodes({
  eventId,
}: {
  eventId: Id<"events">;
}) {
  const batches = useQuery(api.stripeBatches.list, { eventId });
  const active = batches?.filter(
    (batch) => batch.status !== "complete" || batch.error,
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          System admins can generate codes directly in Stripe.
        </p>
        <Link
          href={`/admin/codes?event=${eventId}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Sparkles data-icon="inline-start" />
          Generate or use saved
        </Link>
      </div>
      {active?.map((batch) => (
        <Alert
          key={batch._id}
          variant={batch.error ? "destructive" : "default"}
        >
          <AlertTitle>
            {batch.name} · {batch.generatedCount}/{batch.quantity} saved
          </AlertTitle>
          <AlertDescription>
            {batch.error ? (
              <p>{batch.error}</p>
            ) : (
              <>
                <p>
                  Stripe codes are generating. They will be added here when the
                  batch finishes.
                </p>
                <Progress
                  value={(batch.generatedCount / batch.quantity) * 100}
                  aria-label="Stripe generation progress"
                />
              </>
            )}
            <Link
              href={`/admin/codes?event=${eventId}&batch=${batch._id}`}
              className={buttonVariants({ variant: "link", size: "sm" })}
            >
              View batch{batch.status === "failed" ? " and resume" : ""}
            </Link>
          </AlertDescription>
        </Alert>
      ))}
      <Separator />
    </div>
  );
}
