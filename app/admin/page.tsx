"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, OctagonX, Plus } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { daysUntilEvent, formatEventDate } from "@/lib/event-date";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";
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

interface ManagedEventItem {
  _id: string;
  _creationTime: number;
  name: string;
  slug: string;
  eventDate?: string;
}

function AdminEventRow({
  event,
  past,
}: {
  event: ManagedEventItem;
  past?: boolean;
}) {
  return (
    <li className="border-b border-border">
      <Link
        href={`/admin/events/${event._id}`}
        className={cn(
          "group flex items-center gap-6 px-2 py-5 transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 sm:px-4",
          past && "opacity-60 transition-opacity hover:opacity-100",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="font-heading font-medium tracking-tight">
            {event.name}
          </div>
        </div>
        <span className="hidden text-xs text-muted-dim tabular-nums md:inline">
          {event.eventDate
            ? formatEventDate(event.eventDate)
            : new Date(event._creationTime).toLocaleDateString("en-US", {
                month: "short",
                day: "2-digit",
                year: "numeric",
              })}
        </span>
      </Link>
    </li>
  );
}

export default function AdminDashboard() {
  const events = useQuery(api.events.listManaged);
  const access = useQuery(api.admins.accessLevel);
  const isGlobalAdmin = access?.isGlobalAdmin ?? false;

  // Mirrors the home page grouping: dated events that have passed sink into
  // their own dimmed group; undated events count as active. Active events
  // order soonest-first, with undated ones following in their arrival
  // (newest created) order; past events list the most recently ended first.
  // YYYY-MM-DD compares correctly as a plain string.
  const active =
    events?.filter((e) => !e.eventDate || daysUntilEvent(e.eventDate) >= 0) ??
    [];
  const current = [
    ...active
      .filter((e) => e.eventDate)
      .sort((a, b) => (a.eventDate ?? "").localeCompare(b.eventDate ?? "")),
    ...active.filter((e) => !e.eventDate),
  ];
  const past = (
    events?.filter((e) => e.eventDate && daysUntilEvent(e.eventDate) < 0) ?? []
  ).sort((a, b) => (b.eventDate ?? "").localeCompare(a.eventDate ?? ""));

  return (
    <div>
      <div className="mb-10 flex flex-col items-start gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-[-0.02em]">
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
        <>
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Active events
            </h2>
            <span className="font-mono text-xs text-muted-dim tabular-nums">
              {String(current.length).padStart(2, "0")}
            </span>
          </div>
          {current.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No active events right now.
            </p>
          ) : (
            <ul className="mt-4 border-t border-border">
              {current.map((event) => (
                <AdminEventRow key={event._id} event={event} />
              ))}
            </ul>
          )}
          {past.length > 0 ? (
            <>
              <div className="mt-12 flex items-baseline justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Past events
                </h2>
                <span className="font-mono text-xs text-muted-dim tabular-nums">
                  {String(past.length).padStart(2, "0")}
                </span>
              </div>
              <ul className="mt-4 border-t border-border">
                {past.map((event) => (
                  <AdminEventRow key={event._id} event={event} past />
                ))}
              </ul>
            </>
          ) : null}
        </>
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
  const [eventDate, setEventDate] = useState("");
  const [claimInstructions, setClaimInstructions] = useState("");
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
        eventDate: eventDate || undefined,
        claimInstructions: claimInstructions || undefined,
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
      <DialogTrigger render={<Button />}>
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
                placeholder={slugify(name) || "hackathon-1"}
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
              <FieldLabel htmlFor="event-date">Event date</FieldLabel>
              <Input
                id="event-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
              <FieldDescription>
                Optional — shown on the home and claim pages.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="event-instructions">
                Redemption instructions
              </FieldLabel>
              <Textarea
                id="event-instructions"
                value={claimInstructions}
                onChange={(e) => setClaimInstructions(e.target.value)}
                placeholder="How to redeem the code after claiming"
                rows={4}
                className="resize-y"
              />
              <FieldDescription>
                Optional — shown to attendees after they claim a code.
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
