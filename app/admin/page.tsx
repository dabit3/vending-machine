"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarPlus, OctagonX, Plus } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

export default function AdminDashboard() {
  const events = useQuery(api.events.listManaged);
  const access = useQuery(api.admins.accessLevel);
  const isGlobalAdmin = access?.isGlobalAdmin ?? false;

  return (
    <div>
      <div className="mb-10 flex flex-col items-start gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <p className="eyebrow flex items-center gap-2 text-muted-foreground">
            <span className="inline-block size-1.5 rounded-full bg-brand" />
            Control room
          </p>
          <h1 className="mt-3 font-heading text-3xl font-semibold tracking-[-0.02em]">
            Events
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isGlobalAdmin
              ? "Create events and manage their emails and codes."
              : "Manage the emails and codes of your events."}
          </p>
        </div>
        {isGlobalAdmin ? <NewEventDialog /> : null}
      </div>

      {events === undefined ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <Empty className="border border-dashed border-border-strong py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarPlus />
            </EmptyMedia>
            <EmptyTitle>No events yet</EmptyTitle>
            <EmptyDescription>
              {isGlobalAdmin
                ? "Create your first event to start dispensing codes."
                : "Events you administer will appear here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="border-t border-border">
          {events.map((event, index) => (
            <li key={event._id} className="border-b border-border">
              <Link
                href={`/admin/events/${event._id}`}
                className="group flex items-center gap-6 px-2 py-5 transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 sm:px-4"
              >
                <span className="font-mono text-xs text-muted-dim tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium tracking-tight transition-colors group-hover:text-brand">
                    {event.name}
                  </div>
                </div>
                <span className="hidden font-mono text-xs text-muted-dim sm:inline">
                  /{event.slug}
                </span>
                <span className="hidden font-mono text-xs text-muted-dim tabular-nums md:inline">
                  {new Date(event._creationTime).toLocaleDateString("en-US", {
                    month: "short",
                    day: "2-digit",
                    year: "numeric",
                  })}
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-muted-dim transition-all group-hover:translate-x-0.5 group-hover:text-brand"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewEventDialog() {
  const createEvent = useMutation(api.events.create);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [eventUrl, setEventUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { id } = await createEvent({
        name,
        slug: slug || undefined,
        description: description || undefined,
        creditAmount: creditAmount || undefined,
        eventUrl: eventUrl || undefined,
      });
      toast.success(`Event "${name}" created`);
      router.push(`/admin/events/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="brand" />}>
        <Plus data-icon="inline-start" />
        New event
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">
            New event
          </DialogTitle>
          <DialogDescription>
            Name it, and the claim page URL is generated for you.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="flex flex-col gap-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="event-name">Name</FieldLabel>
              <Input
                id="event-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Hackathon 1"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="event-slug">Slug</FieldLabel>
              <Input
                id="event-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="hackathon-1"
                className="font-mono"
              />
              <FieldDescription>
                Optional — generated from the name.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="event-description">Description</FieldLabel>
              <Textarea
                id="event-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Shown on the claim page"
                rows={4}
                className="resize-y"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="event-credit">Credit amount</FieldLabel>
              <Input
                id="event-credit"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                placeholder="$100"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="event-url">Event URL</FieldLabel>
              <Input
                id="event-url"
                type="url"
                value={eventUrl}
                onChange={(e) => setEventUrl(e.target.value)}
                placeholder="https://tokyohackathon.com"
                className="font-mono"
              />
              <FieldDescription>
                Optional — linked from the claim page.
              </FieldDescription>
            </Field>
          </FieldGroup>
          {error ? (
            <Alert variant="destructive">
              <OctagonX />
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="brand"
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? (
                <>
                  <Spinner data-icon="inline-start" />
                  Creating...
                </>
              ) : (
                "Create event"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
