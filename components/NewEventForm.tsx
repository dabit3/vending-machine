"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  ChevronDown,
  Plus,
  SlidersHorizontal,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { GenerationInput } from "@/convex/stripeValidation";
import { slugify } from "@/lib/slug";
import { parseOrganizerEmails } from "@/lib/organizer-emails";
import type { AttendeeIdentity } from "@/lib/attendee-identity";
import {
  emptyStripeForm,
  generationInput,
  mutationError,
  usd,
  type StripeForm,
} from "@/lib/stripe-form";
import { UPLOAD_CHUNK_SIZE } from "@/lib/upload-limits";
import { SavedBatchPicker } from "@/components/StripeBatchDetails";
import { EventOptionalSettings } from "@/components/EventOptionalSettings";
import {
  EventDatesField,
  DynamicToggle,
  WalkUpReviewToggle,
  ClaimModeToggle,
  IdentityPicker,
  SlugInput,
} from "@/components/EventFormFields";
import {
  ConfirmStripeGeneration,
  StripeGenerationFields,
  StripeModeBadge,
  StripeSetupNotice,
} from "@/components/StripeGenerationFields";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DynamicEventWarning } from "@/components/DynamicEventWarning";
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

type BlockSource = "generate" | "saved" | "paste" | "later";

// One code block being set up: its source and that source's fields.
type BlockDraft = {
  key: number;
  source: BlockSource;
  stripeForm: StripeForm;
  batchId: Id<"stripeBatches"> | "";
  label: string;
  value: string;
  codes: string;
};

const MAX_BLOCKS = 2;

function newBlock(
  key: number,
  source: BlockSource,
  batchId: Id<"stripeBatches"> | "" = "",
): BlockDraft {
  return {
    key,
    source,
    stripeForm: emptyStripeForm,
    batchId,
    label: "",
    value: "",
    codes: "",
  };
}

function pastedCodes(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).filter(Boolean))];
}

// One-line summary of a block for the footer.
function blockSummary(block: BlockDraft): string {
  if (block.source === "generate") {
    const form = block.stripeForm;
    return `${form.quantity || "0"} codes · Redeem ${form.redemptionsPerCode === "2" ? "twice" : "once"} each · ${usd(Math.round(Number(form.amount || 0) * 100))} per redemption${form.durationMonths !== "1" ? ` for ${form.durationMonths || "?"} months` : ""}`;
  }
  if (block.source === "saved") return "Use an existing saved batch";
  if (block.source === "paste") {
    const count = pastedCodes(block.codes).length;
    return `${count} pasted code${count === 1 ? "" : "s"}`;
  }
  return "Add codes when you’re ready";
}

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
  const [eventEndDate, setEventEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dynamic, setDynamic] = useState(false);
  const [walkUpSkipsReview, setWalkUpSkipsReview] = useState(false);
  const [identity, setIdentity] = useState<AttendeeIdentity>("email");
  const [signInMessage, setSignInMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [organizers, setOrganizers] = useState<string[]>([]);
  const [organizerDraft, setOrganizerDraft] = useState("");
  const [organizerError, setOrganizerError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<BlockDraft[]>(() => [
    newBlock(0, initialBatchId ? "saved" : "later", initialBatchId ?? ""),
  ]);
  // With two blocks: one code from each, or the attendee's pick.
  const [claimMode, setClaimMode] = useState<"one" | "all">("all");
  const [pending, setPending] = useState<GenerationInput[] | null>(null);
  const two = blocks.length === 2;
  const generating = blocks.some((block) => block.source === "generate");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const request = useRef<string | null>(null);

  // Any change to the blocks invalidates a reviewed generation request.
  function blocksChanged() {
    request.current = null;
    setError(null);
  }

  function updateBlock(key: number, patch: Partial<BlockDraft>) {
    setBlocks((current) =>
      current.map((block) =>
        block.key === key ? { ...block, ...patch } : block,
      ),
    );
    blocksChanged();
  }
  const claimSlug = slugify(slug || name);

  // Adds the draft (one email, or several pasted ones) as organizer rows and
  // returns the resulting list, or null when the draft has an invalid entry.
  function addOrganizer(): string[] | null {
    if (organizerDraft.trim() === "") return organizers;
    const parsed = parseOrganizerEmails(organizerDraft);
    if (parsed.invalid.length > 0) {
      setOrganizerError(
        parsed.invalid.length === 1
          ? "Enter a valid email address"
          : `Not a valid email: ${parsed.invalid.join(", ")}`,
      );
      return null;
    }
    const next = [
      ...organizers,
      ...parsed.emails.filter((email) => !organizers.includes(email)),
    ];
    setOrganizers(next);
    setOrganizerDraft("");
    setOrganizerError(null);
    return next;
  }

  function removeOrganizer(email: string) {
    setOrganizers((current) => current.filter((item) => item !== email));
  }

  async function submit(generations: GenerationInput[] = []) {
    if (lock.current) return;
    const adminEmails = addOrganizer();
    if (!adminEmails) {
      setError("Fix the organizer email before creating the event.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const event = await create({
        name,
        slug: slug || undefined,
        eventDate: eventDate || undefined,
        eventEndDate: eventEndDate || undefined,
        description: description || undefined,
        claimInstructions: instructions || undefined,
        dynamic,
        walkUpSkipsReview: !dynamic && walkUpSkipsReview ? true : undefined,
        identity,
        signInMessage: signInMessage || undefined,
        contactEmail: contactEmail || undefined,
        adminEmails: adminEmails.length > 0 ? adminEmails : undefined,
        codeBlocks: codeBlocks(generations),
        claimMode: two ? claimMode : undefined,
      });
      toast.success(`Event “${name}” created`, {
        description: generations.length > 0
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
    const problem = blocksProblem();
    if (problem) {
      setError(problem);
      return;
    }
    if (!generating) {
      void submit();
      return;
    }
    if (!config?.configured) return;
    try {
      request.current ??= crypto.randomUUID();
      const id = request.current;
      setPending(
        blocks.flatMap((block, i) =>
          block.source === "generate"
            ? [
                generationInput(
                  {
                    ...block.stripeForm,
                    // A lone block may borrow the event name; two blocks
                    // each need their own.
                    name: block.stripeForm.name || (two ? "" : name),
                  },
                  config.live,
                  i === 0 ? id : `${id}-${i + 1}`,
                ),
              ]
            : [],
        ),
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Check the code details.",
      );
    }
  }

  // The label a block will carry, when it is known in the browser.
  function blockLabel(block: BlockDraft): string {
    return block.source === "generate"
      ? block.stripeForm.name.trim()
      : block.source === "paste"
        ? block.label.trim()
        : "";
  }

  function blocksProblem(): string | null {
    for (const block of blocks) {
      if (block.source !== "paste") continue;
      const count = pastedCodes(block.codes).length;
      if (count === 0) return "Paste at least one code, or pick another source.";
      if (count > UPLOAD_CHUNK_SIZE) {
        return `Paste up to ${UPLOAD_CHUNK_SIZE} codes here; more can be added on the manage page.`;
      }
      if (two && !block.label.trim()) {
        return "Name both code blocks so attendees can tell them apart.";
      }
    }
    if (two) {
      const [first, second] = blocks.map(blockLabel);
      if (first && first === second) {
        return "Give the two code blocks different names.";
      }
      if (blocks[0].batchId && blocks[0].batchId === blocks[1].batchId) {
        return "Choose a different saved batch for each code block.";
      }
    }
    return null;
  }

  function codeBlocks(generations: GenerationInput[]) {
    type Block = {
      name?: string;
      value?: string;
      codes?: string[];
      generation?: GenerationInput;
      batchId?: Id<"stripeBatches">;
    };
    const queue = [...generations];
    const list = blocks.flatMap((block): Block[] => {
      if (block.source === "generate") {
        const generation = queue.shift();
        return generation ? [{ generation }] : [];
      }
      if (block.source === "saved") {
        return block.batchId ? [{ batchId: block.batchId }] : [];
      }
      if (block.source === "paste") {
        return [
          {
            name: block.label.trim() || undefined,
            value: block.value.trim() || undefined,
            codes: pastedCodes(block.codes),
          },
        ];
      }
      return [];
    });
    return list.length > 0 ? list : undefined;
  }

  const blocked =
    busy ||
    (generating && !config?.configured) ||
    blocks.some((block) => block.source === "saved" && !block.batchId);
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
                  <EventDatesField
                    id="event-date"
                    startDate={eventDate}
                    endDate={eventEndDate}
                    onChange={(dates) => {
                      setEventDate(dates.startDate);
                      setEventEndDate(dates.endDate);
                    }}
                    placeholder="Optional"
                  />
                </FieldGroup>
                <EventOptionalSettings
                  idPrefix="event"
                  description={description}
                  onDescriptionChange={setDescription}
                  instructions={instructions}
                  onInstructionsChange={setInstructions}
                  instructionsDescription="Attendees must read these before claiming. They can also view them after claiming."
                  signInMessage={signInMessage}
                  onSignInMessageChange={setSignInMessage}
                  identity={identity}
                  contactEmail={contactEmail}
                  onContactEmailChange={setContactEmail}
                  extraSettings={[
                    {
                      key: "organizers",
                      id: "event-organizer-email",
                      title: "Organizers",
                      addLabel: "Add organizers",
                      icon: UserPlus,
                      set: organizers.length > 0 || organizerDraft !== "",
                      onClear: () => {
                        setOrganizers([]);
                        setOrganizerDraft("");
                        setOrganizerError(null);
                      },
                      summary:
                        organizers.length > 0
                          ? `${organizers.length} ${organizers.length === 1 ? "person" : "people"}`
                          : undefined,
                      render: (focus) => (
                        <div className="flex flex-col gap-3">
                          <Field>
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <Input
                                id="event-organizer-email"
                                type="text"
                                inputMode="email"
                                autoComplete="off"
                                value={organizerDraft}
                                onChange={(e) => {
                                  setOrganizerDraft(e.target.value);
                                  if (organizerError) setOrganizerError(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    addOrganizer();
                                  }
                                }}
                                autoFocus={focus}
                                placeholder="organizer@example.com"
                                className="sm:max-w-sm"
                                aria-invalid={organizerError ? true : undefined}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => addOrganizer()}
                                disabled={organizerDraft.trim() === ""}
                                className="sm:w-auto"
                              >
                                <UserPlus data-icon="inline-start" />
                                Add organizer
                              </Button>
                            </div>
                            {organizerError ? (
                              <FieldDescription className="text-destructive">
                                {organizerError}
                              </FieldDescription>
                            ) : (
                              <FieldDescription>
                                Organizers can edit this event and manage its
                                attendees and codes. They sign in with this
                                email and find the event under Admin.
                              </FieldDescription>
                            )}
                          </Field>
                          {organizers.length > 0 ? (
                            <ul className="flex flex-col gap-2">
                              {organizers.map((email) => (
                                <li
                                  key={email}
                                  className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2"
                                >
                                  <span
                                    aria-hidden
                                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground uppercase"
                                  >
                                    {email.charAt(0)}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-sm">
                                    {email}
                                  </span>
                                  <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    className="shrink-0 text-muted-foreground"
                                    aria-label={`Remove ${email}`}
                                    onClick={() => removeOrganizer(email)}
                                  >
                                    <Trash2 />
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ),
                    },
                  ]}
                />
                <details className="group rounded-lg border bg-muted/30 open:bg-transparent">
                  <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg px-4 py-3 transition-colors outline-none select-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                      <SlidersHorizontal className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium">
                        Claim page settings
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        Custom URL, attendee identity, and who can claim
                      </span>
                    </span>
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <FieldGroup className="border-t px-4 pt-5 pb-4">
                    <Field>
                      <FieldLabel htmlFor="event-slug">Claim URL</FieldLabel>
                      <SlugInput
                        id="event-slug"
                        value={slug}
                        onChange={setSlug}
                        placeholder={claimSlug || "build-with-devin"}
                      />
                      <FieldDescription>
                        /{claimSlug || "your-event"} is generated from the event
                        name unless you set a custom slug.
                      </FieldDescription>
                    </Field>
                    <IdentityPicker
                      id="event-identity"
                      value={identity}
                      onChange={setIdentity}
                      description={
                        identity === "x"
                          ? "Attendees sign in with X and codes go to the @handles on your list. X sign-in must be enabled in Clerk."
                          : "Attendees sign in with the email address on your list."
                      }
                    />
                    <DynamicToggle
                      id="event-dynamic"
                      checked={dynamic}
                      onChange={setDynamic}
                      identity={identity}
                    />
                    {dynamic ? (
                      <DynamicEventWarning />
                    ) : (
                      <WalkUpReviewToggle
                        id="event-walkup-review"
                        checked={walkUpSkipsReview}
                        onChange={setWalkUpSkipsReview}
                      />
                    )}
                  </FieldGroup>
                </details>
              </FieldGroup>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>2. Choose your codes</CardTitle>
              <CardDescription>
                Generate a new batch, use saved codes, paste your own, or
                start with an empty pool. Add a second code to give attendees
                two, for example a plan credit and usage credit.
              </CardDescription>
              {generating && config?.configured && (
                <CardAction>
                  <StripeModeBadge live={config.live} />
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {blocks.map((block, index) => (
                <section
                  key={block.key}
                  aria-label={two ? `Code ${index + 1}` : "Codes"}
                  className={
                    two
                      ? "flex flex-col gap-4 rounded-lg border border-border p-4"
                      : "flex flex-col gap-4"
                  }
                >
                  {two ? (
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="flex items-center gap-2 text-sm font-medium">
                        <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs tabular-nums text-muted-foreground">
                          {index + 1}
                        </span>
                        {blockLabel(block) || `Code ${index + 1}`}
                      </h3>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => {
                          setBlocks((current) =>
                            current.filter((item) => item.key !== block.key),
                          );
                          blocksChanged();
                        }}
                      >
                        <Trash2 data-icon="inline-start" />
                        Remove
                      </Button>
                    </div>
                  ) : null}
                  <Tabs
                    value={block.source}
                    onValueChange={(value) =>
                      updateBlock(block.key, {
                        source: String(value) as BlockSource,
                      })
                    }
                  >
                    <TabsList className="w-full sm:w-fit">
                      <TabsTrigger value="generate">Generate new</TabsTrigger>
                      <TabsTrigger value="saved">Use saved</TabsTrigger>
                      <TabsTrigger value="paste">Paste codes</TabsTrigger>
                      {two ? null : (
                        <TabsTrigger value="later">Add later</TabsTrigger>
                      )}
                    </TabsList>
                    <TabsContent value="generate" className="pt-5">
                      {config === undefined ? (
                        <Skeleton className="h-48" />
                      ) : config.configured ? (
                        <StripeGenerationFields
                          value={block.stripeForm}
                          onChange={(next) =>
                            updateBlock(block.key, { stripeForm: next })
                          }
                          namePlaceholder={
                            two ? undefined : name || "Uses the event name"
                          }
                        />
                      ) : (
                        <StripeSetupNotice />
                      )}
                    </TabsContent>
                    <TabsContent value="saved" className="pt-5">
                      <SavedBatchPicker
                        value={block.batchId}
                        onChange={(next) =>
                          updateBlock(block.key, { batchId: next })
                        }
                      />
                    </TabsContent>
                    <TabsContent value="paste" className="pt-5">
                      <FieldGroup>
                        <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
                          <Field>
                            <FieldLabel htmlFor={`block-${block.key}-label`}>
                              Label
                            </FieldLabel>
                            <Input
                              id={`block-${block.key}-label`}
                              maxLength={80}
                              required={two}
                              value={block.label}
                              onChange={(e) =>
                                updateBlock(block.key, { label: e.target.value })
                              }
                              placeholder={two ? "On-demand usage" : "Optional"}
                            />
                            <FieldDescription>
                              Shown to attendees next to the code.
                            </FieldDescription>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`block-${block.key}-value`}>
                              Value
                            </FieldLabel>
                            <Input
                              id={`block-${block.key}-value`}
                              maxLength={80}
                              value={block.value}
                              onChange={(e) =>
                                updateBlock(block.key, { value: e.target.value })
                              }
                              placeholder="5000"
                            />
                            <FieldDescription>
                              A number shows as dollars.
                            </FieldDescription>
                          </Field>
                        </FieldGroup>
                        <Field>
                          <FieldLabel htmlFor={`block-${block.key}-codes`}>
                            Codes
                          </FieldLabel>
                          <Textarea
                            id={`block-${block.key}-codes`}
                            rows={5}
                            value={block.codes}
                            onChange={(e) =>
                              updateBlock(block.key, { codes: e.target.value })
                            }
                            placeholder={"CODE-ONE\nCODE-TWO\nCODE-THREE"}
                            className="font-mono text-xs"
                          />
                          <FieldDescription>
                            One per line or separated by commas, up to{" "}
                            {UPLOAD_CHUNK_SIZE} here.{" "}
                            {pastedCodes(block.codes).length > 0
                              ? `${pastedCodes(block.codes).length} found.`
                              : "Add more on the manage page later."}
                          </FieldDescription>
                        </Field>
                      </FieldGroup>
                    </TabsContent>
                    <TabsContent value="later" className="pt-5">
                      <Alert>
                        <CalendarPlus />
                        <AlertTitle>Start with the event</AlertTitle>
                        <AlertDescription>
                          Create the claim page now. Then paste or upload
                          existing codes, generate Stripe codes, and add your
                          attendee list.
                        </AlertDescription>
                      </Alert>
                    </TabsContent>
                  </Tabs>
                </section>
              ))}
              {blocks.length < MAX_BLOCKS && blocks[0].source !== "later" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="self-start"
                  onClick={() => {
                    setBlocks((current) => [
                      ...current,
                      newBlock(
                        Math.max(...current.map((item) => item.key)) + 1,
                        "generate",
                      ),
                    ]);
                    blocksChanged();
                  }}
                >
                  <Plus data-icon="inline-start" />
                  Add another code
                </Button>
              ) : null}
              {two ? (
                <>
                  <Separator />
                  <ClaimModeToggle
                    id="event-claim-mode"
                    value={claimMode}
                    onChange={setClaimMode}
                  />
                </>
              ) : null}
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
            {blocks.map((block, index) => (
              <span key={block.key} className="text-muted-foreground">
                {two ? `${blockLabel(block) || `Code ${index + 1}`}: ` : ""}
                {blockSummary(block)}
              </span>
            ))}
            {two ? (
              <span className="text-muted-foreground">
                {claimMode === "all"
                  ? "Each attendee gets both codes"
                  : "Each attendee chooses one code"}
              </span>
            ) : null}
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
                : generating
                  ? "Review and create"
                  : "Create event"}
            </Button>
          </div>
        </div>
      </form>
      <ConfirmStripeGeneration
        input={pending?.[0] ?? null}
        more={pending?.slice(1)}
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
