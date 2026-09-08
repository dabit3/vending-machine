"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { AlertTriangle, Copy, Download, RefreshCw, Ticket } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { downloadCsv } from "@/lib/csv";
import { mutationError, usd } from "@/lib/stripe-form";
import { StripeModeBadge } from "@/components/StripeGenerationFields";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

export function SavedBatchPicker({
  value,
  onChange,
}: {
  value: Id<"stripeBatches"> | "";
  onChange: (value: Id<"stripeBatches"> | "") => void;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.stripeBatches.history,
    { filter: "available" },
    { initialNumItems: 25 },
  );
  const selected = useQuery(
    api.stripeBatches.get,
    value ? { batchId: value } : "skip",
  );
  const batches = status === "LoadingFirstPage" ? undefined : results;
  const id = useId();
  const candidates =
    selected && !results.some((batch) => batch._id === selected._id)
      ? [...results, selected]
      : results;
  const available = candidates.filter(
    (batch) => batch.status === "complete" && !batch.eventId && !batch.expired,
  );
  return (
    <Field>
      <FieldLabel htmlFor={id}>Saved code block</FieldLabel>
      <NativeSelect
        id={id}
        required
        value={value}
        onChange={(e) => onChange(e.target.value as Id<"stripeBatches"> | "")}
        className="w-full"
        disabled={batches === undefined}
      >
        <NativeSelectOption value="">
          {batches === undefined
            ? "Loading code blocks…"
            : "Choose a code block"}
        </NativeSelectOption>
        {available?.map((batch) => (
          <NativeSelectOption key={batch._id} value={batch._id}>
            {batch.name} · {batch.quantity} × {usd(batch.amountCents)} ·{" "}
            {batch.live ? "LIVE" : "Test"}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <FieldDescription>
        Code blocks are saved automatically when generated in Codes. Only
        completed, unassigned, unexpired blocks can be used here.
        {batches !== undefined &&
          available.length === 0 &&
          " No available blocks are loaded yet."}
      </FieldDescription>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/codes/new"
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Create a code block (new tab)
        </Link>
        <Link
          href="/admin/codes"
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          View code library (new tab)
        </Link>
      </div>
      <FieldDescription>
        Your event draft stays here. Return after generation finishes to select
        the saved block.
      </FieldDescription>
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(25)}
        >
          Load more saved blocks
        </Button>
      )}
    </Field>
  );
}

export default function StripeBatchDetails({
  batchId,
  targetEventId,
}: {
  batchId: Id<"stripeBatches"> | null;
  targetEventId?: Id<"events">;
}) {
  const batch = useQuery(api.stripeBatches.get, batchId ? { batchId } : "skip");
  const retry = useMutation(api.stripeBatches.retry);
  const [retryOpen, setRetryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);

  async function resume() {
    if (!batch || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await retry({ batchId: batch._id, confirmLive: batch.live });
      setRetryOpen(false);
      toast.success("Resuming the saved batch");
    } catch (error) {
      setError(
        mutationError(
          error,
          "Could not resume this batch. Check your system-admin access.",
        ),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function copy() {
    if (!batch) return;
    try {
      await navigator.clipboard.writeText(
        batch.codes.map((code) => code.code).join("\n"),
      );
      toast.success("Codes copied");
    } catch {
      toast.error("Could not copy codes. Try downloading the CSV.");
    }
  }

  function download() {
    if (!batch) return;
    downloadCsv(
      `${batch.name.replace(/[^A-Za-z0-9]+/g, "-") || "stripe"}-codes.csv`,
      [
        [
          "code",
          "promotion_code_id",
          "coupon_id",
          "amount_usd",
          "expires_at",
          "redemptions_per_code",
        ],
        ...batch.codes.map((code) => [
          code.code,
          code.id,
          batch.couponId ?? "",
          String(batch.amountCents / 100),
          batch.expiresAt ? new Date(batch.expiresAt).toISOString() : "",
          "1",
        ]),
      ],
    );
  }

  const running = batch?.status === "queued" || batch?.status === "running";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{batch?.name ?? "Your codes"}</CardTitle>
        <CardDescription>
          {batch
            ? `${usd(batch.amountCents)} per code · Single-use · Code prefix: ${batch.prefix || "None"} · ${batch.expiresAt ? `Expires ${new Date(batch.expiresAt).toLocaleString()}` : "No expiration"}`
            : "Generate a batch or choose one from your history."}
        </CardDescription>
        {batch && (
          <CardAction>
            <StripeModeBadge live={batch.live} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {batchId && batch === undefined ? (
          <Skeleton className="h-64" />
        ) : !batch ? (
          <Empty className="min-h-64">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Ticket />
              </EmptyMedia>
              <EmptyTitle>
                {batchId ? "Batch not found" : "Ready when you are"}
              </EmptyTitle>
              <EmptyDescription>
                Saved promotion codes will appear here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="flex flex-col gap-3" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">
                  {batch.generatedCount} of {batch.quantity} codes saved
                </span>
                <Badge
                  variant={
                    batch.status === "failed" ? "destructive" : "outline"
                  }
                >
                  {running && <Spinner data-icon="inline-start" />}
                  {batch.status === "complete"
                    ? batch.expired
                      ? "Expired"
                      : "Saved"
                    : batch.status === "failed"
                      ? "Needs attention"
                      : "Generating"}
                </Badge>
              </div>
              {running && (
                <>
                  <Progress
                    value={(batch.generatedCount / batch.quantity) * 100}
                    aria-label="Code generation progress"
                  />
                  <p className="text-xs text-muted-foreground">
                    Generation continues if you leave this page.
                  </p>
                </>
              )}
            </div>
            {batch.error && (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertTitle>
                  {batch.status === "complete"
                    ? "Codes saved, but not assigned"
                    : batch.couponId && batch.generatedCount === batch.quantity
                      ? "Finalization stopped"
                      : "Generation stopped"}
                </AlertTitle>
                <AlertDescription>{batch.error}</AlertDescription>
              </Alert>
            )}
            {batch.status === "failed" && (
              <div className="flex flex-col items-start gap-2">
                {batch.canRetry ? (
                  <Button variant="outline" onClick={() => setRetryOpen(true)}>
                    <RefreshCw data-icon="inline-start" />
                    Resume generation
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    The retry window has ended. Reconcile the saved coupon in
                    Stripe before starting another batch.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Resume the same batch instead of creating a replacement. Only
                  its original system admin can resume it.
                </p>
              </div>
            )}
            {batch.codes.length > 0 && (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={copy}>
                    <Copy data-icon="inline-start" />
                    Copy {batch.status === "complete" ? "all" : "saved"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={download}>
                    <Download data-icon="inline-start" />
                    Download CSV
                  </Button>
                </div>
                <pre
                  className="max-h-64 overflow-auto rounded-lg border p-4 text-xs leading-6"
                  tabIndex={0}
                  aria-label="Saved promotion codes"
                >
                  {batch.codes.map((code) => code.code).join("\n")}
                </pre>
              </>
            )}
            {batch.status === "complete" && (
              <>
                <Separator />
                {batch.eventId ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {batch.eventName
                        ? `Assigned to ${batch.eventName}`
                        : "Previously assigned · event deleted"}
                    </Badge>
                    {batch.eventName && (
                      <Link
                        href={`/admin/events/${batch.eventId}`}
                        className={buttonVariants({
                          variant: "link",
                          size: "sm",
                        })}
                      >
                        Manage event
                      </Link>
                    )}
                  </div>
                ) : batch.expired ? (
                  <Alert>
                    <AlertTitle>Expired code block</AlertTitle>
                    <AlertDescription>
                      You can still view and export these codes, but this block
                      can no longer be added to an event.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <Alert>
                      <AlertTitle>Saved to your code library</AlertTitle>
                      <AlertDescription>
                        No event required. Your codes are saved and ready to
                        select from “Use saved” when you create an event.
                      </AlertDescription>
                    </Alert>
                    <Link
                      href={`/admin/events/new?batch=${batch._id}`}
                      className={buttonVariants({ variant: "outline" })}
                    >
                      Create an event with this block
                    </Link>
                    <details open={!!targetEventId}>
                      <summary className="cursor-pointer text-sm font-medium">
                        Add to an existing event (optional)
                      </summary>
                      <div className="pt-4">
                        <BatchAssignment
                          key={batch._id}
                          batchId={batch._id}
                          defaultEventId={targetEventId ?? batch.targetEventId}
                          name={batch.name}
                        />
                      </div>
                    </details>
                  </>
                )}
              </>
            )}
            <AlertDialog
              open={retryOpen}
              onOpenChange={(open) => {
                if (!busy) setRetryOpen(open);
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Resume {batch.live ? "live" : "test"} generation?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Resume the remaining {batch.quantity - batch.generatedCount}{" "}
                    codes in “{batch.name}”. Saved codes and the original coupon
                    will be reused.{" "}
                    {batch.live
                      ? "These codes have real value in your live Stripe account."
                      : "These codes work only in Stripe test mode."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {error && (
                  <Alert variant="destructive">
                    <AlertTitle>{error}</AlertTitle>
                  </Alert>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                  <AlertDialogAction disabled={busy} onClick={resume}>
                    {busy && <Spinner data-icon="inline-start" />}Confirm resume
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </CardContent>
      {batch && (
        <CardFooter>
          <p className="break-all text-xs text-muted-foreground">
            Created by {batch.createdBy}
            {batch.couponId ? ` · Coupon ${batch.couponId}` : ""}
          </p>
        </CardFooter>
      )}
    </Card>
  );
}

function BatchAssignment({
  batchId,
  defaultEventId,
  name,
}: {
  batchId: Id<"stripeBatches">;
  defaultEventId?: Id<"events">;
  name: string;
}) {
  const events = useQuery(api.events.listManaged);
  const attach = useMutation(api.stripeBatches.attach);
  const [eventId, setEventId] = useState<string>(defaultEventId ?? "");
  const [codeType, setCodeType] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !eventId) return;
    setBusy(true);
    setError(null);
    try {
      await attach({ batchId, eventId: eventId as Id<"events">, codeType });
      toast.success("Codes added to event");
    } catch (error) {
      setError(
        mutationError(
          error,
          "Could not add this batch. Check your system-admin access.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-event`}>Add to an event</FieldLabel>
          <NativeSelect
            id={`${id}-event`}
            className="w-full"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            required
            disabled={busy}
          >
            <NativeSelectOption value="">Choose an event</NativeSelectOption>
            {events?.map((event) => (
              <NativeSelectOption key={event._id} value={event._id}>
                {event.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-block`}>Code block name</FieldLabel>
          <Input
            id={`${id}-block`}
            value={codeType}
            maxLength={80}
            onChange={(e) => setCodeType(e.target.value)}
            disabled={busy}
          />
          <FieldDescription>
            Use an existing block name to add to it, or a new name to create a
            block. Events support two blocks.
          </FieldDescription>
        </Field>
      </FieldGroup>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !eventId}>
          {busy && <Spinner data-icon="inline-start" />}Add codes to event
        </Button>
      </div>
    </form>
  );
}
