"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { GenerationInput } from "@/convex/stripeValidation";
import { truncateStripeBatchName } from "@/lib/stripe-name";
import {
  emptyStripeForm,
  generationInput,
  mutationError,
} from "@/lib/stripe-form";
import { SavedBatchPicker } from "@/components/StripeBatchDetails";
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
}: {
  eventId?: Id<"events">;
  eventName?: string;
}) {
  const router = useRouter();
  const config = useQuery(api.stripeBatches.configuration);
  const create = useMutation(api.stripeBatches.create);
  const attach = useMutation(api.stripeBatches.attach);
  const [form, setForm] = useState({
    ...emptyStripeForm,
    name: truncateStripeBatchName(eventName ?? ""),
  });
  const [savedId, setSavedId] = useState<Id<"stripeBatches"> | "">("");
  const [blockName, setBlockName] = useState("");
  const [pending, setPending] = useState<GenerationInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<string | null>(null);
  const lock = useRef(false);

  function openBlock(batchId: Id<"stripeBatches">) {
    router.push(
      `/admin/codes?batch=${batchId}${eventId ? `&event=${eventId}` : ""}`,
    );
  }

  function review(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!config?.configured) return;
    try {
      request.current ??= crypto.randomUUID();
      setPending(generationInput(form, config.live, request.current));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Check the code block details.",
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
      setPending(null);
      request.current = null;
      toast.success("Code block saved", {
        description: eventId
          ? "Codes are generating and will be added to this event when ready."
          : "Codes are generating. Your block is saved in the code library; no event is required.",
      });
      openBlock(batchId);
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
      toast.success("Saved codes added to event");
      openBlock(savedId);
      setSavedId("");
    } catch (error) {
      setError(
        mutationError(
          error,
          "Could not add the block. Check your system-admin access.",
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

  const generationForm = !config?.configured ? (
    <StripeSetupNotice />
  ) : (
    <form onSubmit={review} className="flex flex-col gap-5">
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-5">
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
            You will review the maximum discount and confirm before any codes
            are created.
          </AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={busy}>
        <Sparkles data-icon="inline-start" />
        Review and save codes
      </Button>
    </form>
  );

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>
            {eventId ? "Add a code block" : "Generate a code block"}
          </CardTitle>
          <CardDescription>
            {eventName
              ? `Codes will be saved and added to “${eventName}”.`
              : "No event required. Codes are saved automatically to your library. Assign the block to an event whenever you are ready."}
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
          ) : eventId ? (
            <Tabs defaultValue="generate" onValueChange={() => setError(null)}>
              <TabsList>
                <TabsTrigger value="generate">Generate new</TabsTrigger>
                <TabsTrigger value="saved">Use saved block</TabsTrigger>
              </TabsList>
              <TabsContent value="generate" className="pt-4">
                {generationForm}
              </TabsContent>
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
            </Tabs>
          ) : (
            generationForm
          )}
          {error && !pending && (
            <Alert variant="destructive">
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          )}
        </CardContent>
      </Card>
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
