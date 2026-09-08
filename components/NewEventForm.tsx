"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, ArrowRight, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { GenerationInput } from "@/convex/stripeValidation";
import { slugify } from "@/lib/slug";
import {
  emptyStripeForm,
  generationInput,
  mutationError,
  usd,
} from "@/lib/stripe-form";
import { SavedBatchPicker } from "@/components/StripeBatchDetails";
import { ClaimInstructionsField } from "@/components/ClaimInstructionsField";
import {
  ConfirmStripeGeneration,
  StripeGenerationFields,
  StripeModeBadge,
  StripeSetupNotice,
} from "@/components/StripeGenerationFields";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export default function NewEventForm({
  initialBatchId,
}: {
  initialBatchId?: Id<"stripeBatches">;
}) {
  const router = useRouter();
  const create = useMutation(api.events.create);
  const config = useQuery(api.stripeBatches.configuration);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [hidden, setHidden] = useState(false);
  const [dynamic, setDynamic] = useState(false);
  const [source, setSource] = useState(initialBatchId ? "saved" : "generate");
  const [batchId, setBatchId] = useState<Id<"stripeBatches"> | "">(
    initialBatchId ?? "",
  );
  const [stripeForm, setStripeForm] = useState(emptyStripeForm);
  const [pending, setPending] = useState<GenerationInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const request = useRef<string | null>(null);
  const claimSlug = slugify(slug || name);

  async function submit(generation?: GenerationInput) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const event = await create({
        name,
        slug: slug || undefined,
        eventDate: eventDate || undefined,
        description: description || undefined,
        claimInstructions: instructions || undefined,
        hidden,
        dynamic,
        stripeGeneration: generation,
        stripeBatchId: source === "saved" && batchId ? batchId : undefined,
      });
      toast.success(`Event “${name}” created`, {
        description: generation
          ? "Codes are generating in the background. Add your attendees while you wait."
          : "Add attendees to let them claim their codes.",
      });
      router.push(`/admin/events/${event.id}`);
    } catch (error) {
      setError(
        mutationError(
          error,
          "Could not create the event. Check the details and your system-admin access, then retry.",
        ),
      );
      lock.current = false;
      setBusy(false);
    }
  }

  function review(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!claimSlug) {
      setError("The event name must contain letters or numbers.");
      return;
    }
    if (source !== "generate") {
      void submit();
      return;
    }
    if (!config?.configured) return;
    try {
      request.current ??= crypto.randomUUID();
      setPending(
        generationInput(
          { ...stripeForm, name: stripeForm.name || name },
          config.live,
          request.current,
        ),
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Check the code details.",
      );
    }
  }

  const blocked =
    busy ||
    (source === "generate" && !config?.configured) ||
    (source === "saved" && !batchId);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <header className="flex flex-col items-start gap-3">
        <Link
          href="/admin"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ArrowLeft data-icon="inline-start" />
          Events
        </Link>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Create an event
        </h1>
        <p className="text-sm text-muted-foreground">
          Set up the claim page and its codes together. Add attendees after
          creating the event.
        </p>
      </header>
      <form onSubmit={review} className="flex flex-col gap-6">
        <fieldset disabled={busy} className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>1. Event details</CardTitle>
              <CardDescription>
                Start with a name. Everything else is optional.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
                  <Field>
                    <FieldLabel htmlFor="event-name">Event name</FieldLabel>
                    <Input
                      id="event-name"
                      required
                      maxLength={120}
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        request.current = null;
                      }}
                      placeholder="Build with Devin"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="event-date">Event date</FieldLabel>
                    <Input
                      id="event-date"
                      type="date"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                    />
                  </Field>
                </FieldGroup>
                <Field>
                  <FieldLabel htmlFor="event-description">
                    Description
                  </FieldLabel>
                  <Textarea
                    id="event-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="A short welcome for your attendees"
                  />
                </Field>
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium">
                    Claim page settings
                  </summary>
                  <FieldGroup className="mt-5">
                    <Field>
                      <FieldLabel htmlFor="event-slug">Claim URL</FieldLabel>
                      <Input
                        id="event-slug"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder={claimSlug || "build-with-devin"}
                      />
                      <FieldDescription>
                        /{claimSlug || "your-event"} — generated from the event
                        name unless you set a custom slug.
                      </FieldDescription>
                    </Field>
                    <ClaimInstructionsField
                      id="event-instructions"
                      value={instructions}
                      onChange={setInstructions}
                      description="Attendees must read these before claiming. They can also view them after claiming."
                    />
                    <Field orientation="horizontal">
                      <Checkbox
                        id="event-hidden"
                        checked={hidden}
                        onCheckedChange={(checked) =>
                          setHidden(checked === true)
                        }
                      />
                      <FieldLabel htmlFor="event-hidden">
                        Hide from the home page
                      </FieldLabel>
                    </Field>
                    <FieldDescription>
                      Hidden events are still accessible through their claim
                      URL.
                    </FieldDescription>
                    <Field orientation="horizontal">
                      <Checkbox
                        id="event-dynamic"
                        checked={dynamic}
                        onCheckedChange={(checked) =>
                          setDynamic(checked === true)
                        }
                      />
                      <FieldLabel htmlFor="event-dynamic">
                        Dynamic — anyone can claim
                      </FieldLabel>
                    </Field>
                    <FieldDescription>
                      No participant list needed. Anyone who signs in from the
                      claim URL or QR code gets a code, and their email is
                      recorded so each address can only claim once.
                    </FieldDescription>
                  </FieldGroup>
                </details>
              </FieldGroup>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>2. Choose your codes</CardTitle>
              <CardDescription>
                Generate a new batch, use saved codes, or start with an empty
                pool.
              </CardDescription>
              {source === "generate" && config?.configured && (
                <CardAction>
                  <StripeModeBadge live={config.live} />
                </CardAction>
              )}
            </CardHeader>
            <CardContent>
              <Tabs
                value={source}
                onValueChange={(value) => {
                  setSource(String(value));
                  setError(null);
                }}
              >
                <TabsList className="w-full sm:w-fit">
                  <TabsTrigger value="generate">Generate new</TabsTrigger>
                  <TabsTrigger value="saved">Use saved</TabsTrigger>
                  <TabsTrigger value="later">Add later</TabsTrigger>
                </TabsList>
                <TabsContent value="generate" className="pt-5">
                  {config === undefined ? (
                    <Skeleton className="h-48" />
                  ) : config.configured ? (
                    <StripeGenerationFields
                      value={stripeForm}
                      onChange={(next) => {
                        setStripeForm(next);
                        request.current = null;
                      }}
                      namePlaceholder={name || "Uses the event name"}
                    />
                  ) : (
                    <StripeSetupNotice />
                  )}
                </TabsContent>
                <TabsContent value="saved" className="pt-5">
                  <SavedBatchPicker value={batchId} onChange={setBatchId} />
                </TabsContent>
                <TabsContent value="later" className="pt-5">
                  <Alert>
                    <CalendarPlus />
                    <AlertTitle>Start with the event</AlertTitle>
                    <AlertDescription>
                      Create the claim page now. Then paste or upload existing
                      codes, generate Stripe codes, and add your attendee list.
                    </AlertDescription>
                  </Alert>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </fieldset>
        {error && !pending && (
          <Alert variant="destructive">
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        )}
        <Separator />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{name || "Your new event"}</span>
            <span className="text-muted-foreground">
              {source === "generate"
                ? `${stripeForm.quantity || "0"} single-use codes · ${usd(Math.round(Number(stripeForm.amount || 0) * 100))} each`
                : source === "saved"
                  ? "Use an existing saved batch"
                  : "Add codes when you’re ready"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline">System admin</Badge>
            <Button type="submit" size="lg" disabled={blocked}>
              {busy ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <ArrowRight data-icon="inline-end" />
              )}
              {busy
                ? "Creating…"
                : source === "generate"
                  ? "Review and create"
                  : "Create event"}
            </Button>
          </div>
        </div>
      </form>
      <ConfirmStripeGeneration
        input={pending}
        busy={busy}
        error={error}
        eventName={name}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) void submit(pending);
        }}
      />
    </div>
  );
}
