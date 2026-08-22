"use client";

import { useState } from "react";
import { Ban, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

export default function BlacklistPage() {
  const access = useQuery(api.admins.accessLevel);
  const entries = useQuery(
    api.blacklist.list,
    access?.isGlobalAdmin ? {} : "skip"
  );
  const addEmail = useMutation(api.blacklist.add);
  const removeEmail = useMutation(api.blacklist.remove);

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<Id<"blacklistedEmails"> | null>(
    null
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await addEmail({ email });
      toast.success(`${email.trim().toLowerCase()} is now blacklisted`);
      setEmail("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to blacklist email"
      );
    } finally {
      setSubmitting(false);
    }
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

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-10">
        <p className="eyebrow flex items-center gap-2 text-muted-foreground">
          <span className="inline-block size-1.5 rounded-full bg-border-strong" />
          Access control
        </p>
        <h1 className="mt-3 font-heading text-4xl font-medium tracking-[-0.01em]">
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

      {entries === undefined ? (
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
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {entries.map((entry) => (
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
      )}
    </div>
  );
}
