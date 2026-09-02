"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Ban, Search, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { formatEventDate } from "@/lib/event-date";

const SEARCH_DEBOUNCE_MS = 250;

export default function BlacklistPage() {
  const access = useQuery(api.admins.accessLevel);
  const entries = useQuery(
    api.blacklist.list,
    access?.isGlobalAdmin ? {} : "skip"
  );
  const addEmail = useMutation(api.blacklist.add);
  const removeEmail = useMutation(api.blacklist.remove);

  const [email, setEmail] = useState("");
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [addingEmail, setAddingEmail] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<Id<"blacklistedEmails"> | null>(
    null
  );

  const normalizedSearch = search.trim().toLowerCase();
  const visibleEntries = (entries ?? []).filter(
    (entry) =>
      normalizedSearch === "" || entry.email.includes(normalizedSearch)
  );
  const blacklisted = new Set(entries?.map((entry) => entry.email));

  // The attendee lookup hits the backend, so it trails typing slightly
  // instead of re-querying on every keystroke.
  const [historyQuery, setHistoryQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(
      () => setHistoryQuery(normalizedSearch),
      SEARCH_DEBOUNCE_MS
    );
    return () => clearTimeout(timer);
  }, [normalizedSearch]);
  const history = useQuery(
    api.emails.searchAttendees,
    access?.isGlobalAdmin && historyQuery ? { query: historyQuery } : "skip"
  );
  const historyLoading =
    history === undefined || historyQuery !== normalizedSearch;

  async function blacklist(address: string) {
    try {
      await addEmail({ email: address });
      toast.success(`${address.trim().toLowerCase()} is now blacklisted`);
      return true;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to blacklist email"
      );
      return false;
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    if (await blacklist(email)) setEmail("");
    setSubmitting(false);
  }

  async function handleQuickAdd(address: string) {
    setAddingEmail(address);
    await blacklist(address);
    setAddingEmail(null);
  }

  async function handleRemove(id: Id<"blacklistedEmails">) {
    setRemovingId(id);
    try {
      await removeEmail({ id });
      toast.success("Removed from blacklist");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to remove from blacklist"
      );
    } finally {
      setRemovingId(null);
    }
  }

  if (access && !access.isGlobalAdmin) {
    return (
      <div className="mx-auto max-w-2xl">
        <Alert>
          <ShieldAlert />
          <AlertTitle>Global admins only</AlertTitle>
          <AlertDescription>
            Only global admins can manage the email blacklist. You have
            event-level access — head back to your events.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const blacklistRows =
    entries === undefined ? (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 rounded-md" />
        <Skeleton className="h-12 rounded-md" />
      </div>
    ) : entries.length === 0 ? (
      <Empty className="border border-dashed border-border-strong py-16">
        <EmptyHeader>
          <EmptyDescription>No blacklisted emails.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    ) : visibleEntries.length === 0 ? (
      <Empty className="border border-dashed border-border-strong py-10">
        <EmptyHeader>
          <EmptyDescription>
            No blacklisted emails match &ldquo;{search.trim()}&rdquo;.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    ) : (
      <ul className="divide-y divide-border border-y border-border">
        {visibleEntries.map((entry) => (
          <li
            key={entry._id}
            className="flex min-h-12 items-center justify-between gap-3 px-1 py-2 transition-colors hover:bg-surface"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm">{entry.email}</span>
              {entry.addedBy ? (
                <span className="truncate text-xs text-muted-dim">
                  Added by {entry.addedBy}
                </span>
              ) : null}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${entry.email} from blacklist`}
              onClick={() => handleRemove(entry._id)}
              disabled={removingId === entry._id}
              aria-busy={removingId === entry._id}
              className="shrink-0 text-muted-foreground"
            >
              {removingId === entry._id ? <Spinner /> : <X />}
            </Button>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-10">
        <p className="eyebrow flex items-center gap-2 text-muted-foreground">
          <span className="inline-block size-1.5 rounded-full bg-border-strong" />
          Access control
        </p>
        <h1 className="mt-3 font-heading text-3xl font-semibold tracking-[-0.02em]">
          Blacklist
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Blacklisted emails are rejected whenever they would be added to any
          event — uploads, flagged-email approvals, and access-request
          approvals all skip them.
        </p>
      </div>

      <form onSubmit={handleAdd} className="mb-10">
        <Field>
          <FieldLabel htmlFor="blacklist-email">Blacklist an email</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="blacklist-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="bad-actor@example.com"
              className="text-sm"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="submit"
                variant="default"
                size="xs"
                disabled={submitting}
                aria-busy={submitting}
              >
                <Ban data-icon="inline-start" />
                {submitting ? "Adding..." : "Blacklist"}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>
      </form>

      <div className="mb-4 flex items-center justify-between gap-3">
        <InputGroup className="max-w-sm">
          <InputGroupAddon align="inline-start">
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emails"
            aria-label="Search blacklisted emails and event history"
            className="text-sm"
          />
        </InputGroup>
        {entries && entries.length > 0 ? (
          <span className="shrink-0 text-xs text-muted-dim">
            {normalizedSearch
              ? `${visibleEntries.length} of ${entries.length} blacklisted`
              : `${entries.length} ${entries.length === 1 ? "email" : "emails"}`}
          </span>
        ) : null}
      </div>
      <p className="-mt-2 mb-6 text-xs text-muted-dim">
        Filters the blacklist and looks up which events an address has been
        eligible for or claimed a code at.
      </p>

      {normalizedSearch === "" ? (
        blacklistRows
      ) : (
        <div className="flex flex-col gap-10">
          <section>
            <h2 className="eyebrow mb-3 text-muted-foreground">Blacklist</h2>
            {blacklistRows}
          </section>

          <section>
            <h2 className="eyebrow mb-3 text-muted-foreground">
              Event history
            </h2>
            {historyLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-16 rounded-md" />
                <Skeleton className="h-16 rounded-md" />
              </div>
            ) : history.attendees.length === 0 ? (
              <Empty className="border border-dashed border-border-strong py-10">
                <EmptyHeader>
                  <EmptyDescription>
                    No attendees start with &ldquo;{search.trim()}&rdquo;.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                <ul className="divide-y divide-border border-y border-border">
                  {history.attendees.map((attendee) => (
                    <li key={attendee.email} className="px-1 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm">
                            {attendee.email}
                          </span>
                          {blacklisted.has(attendee.email) ? (
                            <Badge variant="destructive">Blacklisted</Badge>
                          ) : null}
                        </span>
                        {blacklisted.has(attendee.email) ? null : (
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => handleQuickAdd(attendee.email)}
                            disabled={addingEmail === attendee.email}
                            aria-busy={addingEmail === attendee.email}
                            className="shrink-0 text-muted-foreground"
                          >
                            {addingEmail === attendee.email ? (
                              <Spinner />
                            ) : (
                              <Ban data-icon="inline-start" />
                            )}
                            Blacklist
                          </Button>
                        )}
                      </div>
                      <ul className="mt-2 flex flex-col gap-1">
                        {attendee.events.map((event) => (
                          <li
                            key={event.id}
                            className="flex items-center justify-between gap-3 text-xs"
                          >
                            <span className="flex min-w-0 items-baseline gap-2">
                              <Link
                                href={`/admin/events/${event.id}`}
                                className="truncate text-foreground underline-offset-4 hover:underline"
                              >
                                {event.name}
                              </Link>
                              {event.eventDate ? (
                                <span className="shrink-0 text-muted-dim">
                                  {formatEventDate(event.eventDate)}
                                </span>
                              ) : null}
                            </span>
                            <span className="shrink-0 text-muted-foreground">
                              {event.claimedAt !== null
                                ? `Claimed ${formatClaimDate(event.claimedAt)}`
                                : "Eligible, not claimed"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
                {history.hasMore ? (
                  <p className="mt-3 text-xs text-muted-dim">
                    Showing the first {history.attendees.length} matches — keep
                    typing to narrow the search.
                  </p>
                ) : null}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function formatClaimDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
