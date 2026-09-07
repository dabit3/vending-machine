"use client";

import { useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { GenerationInput } from "@/convex/stripeValidation";
import {
  emptyStripeForm,
  generationInput,
  mutationError,
} from "@/lib/stripe-form";
import StripeBatchDetails, {
  BatchHistoryPicker,
  SavedBatchPicker,
} from "@/components/StripeBatchDetails";
import {
  ConfirmStripeGeneration,
  StripeGenerationFields,
  StripeModeBadge,
  StripeSetupNotice,
} from "@/components/StripeGenerationFields";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function StripeCodeStudio({
  eventId,
  eventName,
  initialBatchId,
}: {
  eventId?: Id<"events">;
  eventName?: string;
  initialBatchId?: Id<"stripeBatches">;
}) {
  const config = useQuery(api.stripeBatches.configuration);
  const history = usePaginatedQuery(
    api.stripeBatches.history,
    {},
    { initialNumItems: 25 },
  );
  const batches =
    history.status === "LoadingFirstPage" ? undefined : history.results;
  const create = useMutation(api.stripeBatches.create);
  const attach = useMutation(api.stripeBatches.attach);
  const [form, setForm] = useState({
    ...emptyStripeForm,
    name: eventName ?? "",
  });
  const [selected, setSelected] = useState<Id<"stripeBatches"> | null>(
    initialBatchId ?? null,
  );
  const [savedId, setSavedId] = useState<Id<"stripeBatches"> | "">("");
  const [blockName, setBlockName] = useState("");
  const [pending, setPending] = useState<GenerationInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<string | null>(null);
  const lock = useRef(false);
  const effectiveSelected = selected ?? batches?.[0]?._id ?? null;

  function review(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!config?.configured) return;
    try {
      request.current ??= crypto.randomUUID();
      setPending(generationInput(form, config.live, request.current));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Check the batch details.",
      );
    }
  }

  async function generate() {
    if (!pending || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const batchId = await create({
        ...pending,
        eventId,
        codeType: blockName.trim() || undefined,
      });
      setSelected(batchId);
      setPending(null);
      request.current = null;
      toast.success("Code generation started", {
        description: eventId
          ? "Codes will be added to this event when the batch finishes."
          : "Your batch is saved. You can leave this page while it runs.",
      });
    } catch (error) {
      setError(
        mutationError(
          error,
          "Could not start generation. Check your system-admin access and retry.",
        ),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function useSaved(e: React.FormEvent) {
    e.preventDefault();
    if (!savedId || !eventId || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await attach({
        batchId: savedId,
        eventId,
        codeType: blockName.trim() || undefined,
      });
      setSelected(savedId);
      setSavedId("");
      toast.success("Saved codes added to event");
    } catch (error) {
      setError(
        mutationError(
          error,
          "Could not add the batch. Check your system-admin access.",
        ),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const blockField = eventId && (
    <Field>
      <FieldLabel htmlFor="studio-block">Destination block</FieldLabel>
      <Input
        id="studio-block"
        maxLength={80}
        value={blockName}
        onChange={(e) => {
          setBlockName(e.target.value);
          request.current = null;
        }}
        placeholder="Use the batch name"
      />
      <FieldDescription>
        Optional. Enter an existing block name to add to it. Its value must
        match this batch.
      </FieldDescription>
    </Field>
  );

  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>
            {eventId ? "Add Stripe codes" : "Generate a batch"}
          </CardTitle>
          <CardDescription>
            {eventName
              ? `Codes will be added to “${eventName}”.`
              : "Create single-use promotion codes without leaving the app."}
          </CardDescription>
          {config?.configured && (
            <CardAction>
              <StripeModeBadge live={config.live} />
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {config === undefined ? (
            <Skeleton className="h-64" />
          ) : (
            <Tabs defaultValue="generate" onValueChange={() => setError(null)}>
              <TabsList>
                <TabsTrigger value="generate">Generate new</TabsTrigger>
                {eventId && (
                  <TabsTrigger value="saved">Use saved batch</TabsTrigger>
                )}
              </TabsList>
              <TabsContent value="generate" className="pt-4">
                {!config.configured ? (
                  <StripeSetupNotice />
                ) : (
                  <form onSubmit={review} className="flex flex-col gap-5">
                    <fieldset
                      disabled={busy}
                      className="flex min-w-0 flex-col gap-5"
                    >
                      <StripeGenerationFields
                        value={form}
                        onChange={(next) => {
                          setForm(next);
                          request.current = null;
                        }}
                      />
                      {blockField}
                    </fieldset>
                    {config.live && (
                      <Alert>
                        <AlertTitle>Live Stripe account</AlertTitle>
                        <AlertDescription>
                          You will review the maximum discount and confirm
                          before any codes are created.
                        </AlertDescription>
                      </Alert>
                    )}
                    <Button type="submit" disabled={busy}>
                      <Sparkles data-icon="inline-start" />
                      Review and generate
                    </Button>
                  </form>
                )}
              </TabsContent>
              {eventId && (
                <TabsContent value="saved" className="pt-4">
                  <form onSubmit={useSaved} className="flex flex-col gap-5">
                    <FieldGroup>
                      <SavedBatchPicker value={savedId} onChange={setSavedId} />
                      {blockField}
                    </FieldGroup>
                    <Button type="submit" disabled={busy || !savedId}>
                      {busy && <Spinner data-icon="inline-start" />}Add saved
                      codes
                    </Button>
                  </form>
                </TabsContent>
              )}
            </Tabs>
          )}
          {error && !pending && (
            <Alert variant="destructive">
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          )}
        </CardContent>
      </Card>
      <div className="flex min-w-0 flex-col gap-5">
        <BatchHistoryPicker
          batches={batches}
          value={effectiveSelected ?? ""}
          onChange={setSelected}
        />
        {(history.status === "CanLoadMore" ||
          history.status === "LoadingMore") && (
          <Button
            type="button"
            variant="outline"
            disabled={history.status === "LoadingMore"}
            onClick={() => history.loadMore(25)}
          >
            Load older batches
          </Button>
        )}
        <StripeBatchDetails
          key={effectiveSelected ?? "empty"}
          batchId={effectiveSelected}
          targetEventId={eventId}
        />
      </div>
      <ConfirmStripeGeneration
        input={pending}
        busy={busy}
        error={error}
        onCancel={() => setPending(null)}
        onConfirm={generate}
      />
    </div>
  );
}
