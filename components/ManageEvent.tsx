"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Download,
  Inbox,
  ShieldCheck,
  Ticket,
  Trash2,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { downloadCsv } from "@/lib/csv";
import {
  localInputToTimestamp,
  timestampToLocalInput,
} from "@/lib/claim-window";
import { fileToItems } from "@/lib/spreadsheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

const UPLOAD_CHUNK_SIZE = 500;

export default function ManageEvent({ id }: { id: Id<"events"> }) {
  const event = useQuery(api.events.get, { id });
  const emails = useQuery(api.emails.list, { eventId: id });
  const codes = useQuery(api.codes.list, { eventId: id });
  const access = useQuery(api.admins.accessLevel);
  const addEmails = useMutation(api.emails.add);
  const removeEmail = useMutation(api.emails.remove);
  const addCodes = useMutation(api.codes.add);
  const removeCode = useMutation(api.codes.remove);

  const [emailInput, setEmailInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);

  if (event === undefined) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (event === null) {
    return (
      <Empty className="border border-dashed border-border-strong py-16">
        <EmptyHeader>
          <EmptyDescription>Event not found.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const claimedCount = codes?.filter((c) => c.claimedBy).length ?? 0;
  const codeCount = codes?.length ?? 0;

  async function handleAddEmails(e: React.FormEvent) {
    e.preventDefault();
    const list = emailInput.split(/[\n,;\s]+/).filter(Boolean);
    if (list.length === 0) return;
    const { added, skipped } = await addEmails({ eventId: id, emails: list });
    toast.success(`Added ${added} emails`, {
      description: skipped ? `Skipped ${skipped} (duplicates/invalid).` : undefined,
    });
    setEmailInput("");
  }

  async function handleAddCodes(e: React.FormEvent) {
    e.preventDefault();
    const list = codeInput.split(/[\n,;\s]+/).filter(Boolean);
    if (list.length === 0) return;
    const { added, skipped } = await addCodes({ eventId: id, codes: list });
    toast.success(`Added ${added} codes`, {
      description: skipped ? `Skipped ${skipped} (duplicates).` : undefined,
    });
    setCodeInput("");
  }

  function exportEmails() {
    if (!emails || !event) return;
    downloadCsv(`${event.slug}-emails.csv`, [
      ["email"],
      ...emails.map((e) => [e.email]),
    ]);
  }

  function exportCodes() {
    if (!codes || !event) return;
    downloadCsv(`${event.slug}-codes.csv`, [
      ["code", "claimed_by", "claimed_at"],
      ...codes.map((c) => [
        c.code,
        c.claimedBy ?? "",
        c.claimedAt ? new Date(c.claimedAt).toISOString() : "",
      ]),
    ]);
  }

  async function importFile(
    file: File,
    kind: "emails" | "codes",
    send: (items: string[]) => Promise<{ added: number; skipped: number }>,
    setBusy: (busy: boolean) => void
  ) {
    setBusy(true);
    const toastId = toast.loading(`Reading ${file.name}...`);
    try {
      const items = await fileToItems(file, kind);
      if (items.length === 0) {
        toast.warning(`Nothing to import found in ${file.name}`, { id: toastId });
        return;
      }
      let added = 0;
      let skipped = 0;
      for (let i = 0; i < items.length; i += UPLOAD_CHUNK_SIZE) {
        toast.loading(
          `Uploading ${Math.min(i + UPLOAD_CHUNK_SIZE, items.length)} / ${items.length}...`,
          { id: toastId }
        );
        const res = await send(items.slice(i, i + UPLOAD_CHUNK_SIZE));
        added += res.added;
        skipped += res.skipped;
      }
      toast.success(`Added ${added} from ${file.name}`, {
        id: toastId,
        description: skipped ? `Skipped ${skipped} duplicates or invalid rows.` : undefined,
      });
    } catch {
      toast.error(`Could not read ${file.name}`, {
        id: toastId,
        description: "Upload a .csv or .xlsx file, or try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Button
          variant="ghost"
          size="xs"
          className="-ml-2 text-muted-foreground"
          render={<Link href="/admin" />}
          nativeButton={false}
        >
          <ArrowLeft data-icon="inline-start" />
          All events
        </Button>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-heading text-3xl font-semibold tracking-[-0.02em]">
            {event.name}
          </h1>
          <Button
            variant="outline"
            render={
              <Link
                href={`/${event.slug}`}
                target="_blank"
                rel="noreferrer"
              />
            }
            nativeButton={false}
          >
            <span className="font-mono text-xs">/{event.slug}</span>
            <ArrowUpRight data-icon="inline-end" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Eligible emails" value={emails?.length} />
        <StatCard label="Codes in pool" value={codes?.length} />
        <Card className="gap-2">
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <span className="eyebrow text-muted-foreground">Claimed</span>
              <span className="font-mono text-xs text-muted-dim tabular-nums">
                {codeCount > 0
                  ? `${Math.round((claimedCount / codeCount) * 100)}%`
                  : "—"}
              </span>
            </div>
            <div className="font-heading text-3xl font-semibold tracking-tight tabular-nums">
              {codes ? claimedCount : "—"}
              <span className="text-base text-muted-dim"> / {codes ? codeCount : "—"}</span>
            </div>
            <Progress
              value={codeCount > 0 ? (claimedCount / codeCount) * 100 : 0}
              className="w-full"
            />
          </CardContent>
        </Card>
      </div>

      <EventDetailsForm
        key={event._id}
        event={event}
        canDelete={access?.isGlobalAdmin ?? false}
      />

      <div className="grid gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="size-4 text-muted-dim" aria-hidden />
              Eligible emails
            </CardTitle>
            <CardDescription>
              Only these addresses can claim a code.
            </CardDescription>
            <CardAction className="col-span-full col-start-1 row-span-1 row-start-3 mt-2 flex w-full flex-wrap items-center gap-2 justify-self-start sm:col-span-1 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:w-auto sm:flex-nowrap sm:justify-self-end">
              {emails && emails.length > 0 ? (
                <Button variant="outline" size="sm" onClick={exportEmails}>
                  <Download data-icon="inline-start" />
                  Export
                </Button>
              ) : null}
              <UploadButton busy={emailBusy} onFile={(f) => importFile(f, "emails", (items) => addEmails({ eventId: id, emails: items }), setEmailBusy)} />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form onSubmit={handleAddEmails} className="flex flex-col gap-3">
              <Textarea
                aria-label="Email addresses to add"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                rows={4}
                placeholder={"one@example.com\ntwo@example.com"}
                className="resize-y font-mono text-sm"
              />
              <Button
                type="submit"
                variant="secondary"
                className="self-start"
                disabled={!emailInput.trim()}
              >
                Add emails
              </Button>
            </form>
            <RowList
              items={emails?.map((e) => ({
                key: e._id,
                label: e.email,
                onRemove: () =>
                  removeEmail({ id: e._id }).catch(() =>
                    toast.error("Failed to remove email")
                  ),
              }))}
              emptyText="No emails yet."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="size-4 text-muted-dim" aria-hidden />
              Codes
            </CardTitle>
            <CardDescription>
              Each email is assigned one unclaimed code.
            </CardDescription>
            <CardAction className="col-span-full col-start-1 row-span-1 row-start-3 mt-2 flex w-full flex-wrap items-center gap-2 justify-self-start sm:col-span-1 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:w-auto sm:flex-nowrap sm:justify-self-end">
              {codes && codes.length > 0 ? (
                <Button variant="outline" size="sm" onClick={exportCodes}>
                  <Download data-icon="inline-start" />
                  Export
                </Button>
              ) : null}
              <UploadButton busy={codeBusy} onFile={(f) => importFile(f, "codes", (items) => addCodes({ eventId: id, codes: items }), setCodeBusy)} />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form onSubmit={handleAddCodes} className="flex flex-col gap-3">
              <Textarea
                aria-label="Credit codes to add"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                rows={4}
                placeholder={"CODE-001\nCODE-002"}
                className="resize-y font-mono text-sm"
              />
              <Button
                type="submit"
                variant="secondary"
                className="self-start"
                disabled={!codeInput.trim()}
              >
                Add codes
              </Button>
            </form>
            <RowList
              items={codes?.map((c) => ({
                key: c._id,
                label: c.code,
                claimedBy: c.claimedBy ?? undefined,
                onRemove: c.claimedBy
                  ? undefined
                  : () =>
                      removeCode({ id: c._id }).catch((err) =>
                        toast.error(
                          err instanceof Error
                            ? err.message
                            : "Failed to remove code"
                        )
                      ),
              }))}
              emptyText="No codes yet."
            />
          </CardContent>
        </Card>
      </div>

      <EventAdminsCard eventId={id} />
    </div>
  );
}

function EventAdminsCard({ eventId }: { eventId: Id<"events"> }) {
  const admins = useQuery(api.eventAdmins.list, { eventId });
  const addAdmin = useMutation(api.eventAdmins.add);
  const removeAdmin = useMutation(api.eventAdmins.remove);

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await addAdmin({ eventId, email });
      toast.success(`${email.trim().toLowerCase()} can now manage this event`);
      setEmail("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add event admin"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-dim" aria-hidden />
          Event admins
        </CardTitle>
        <CardDescription>
          These emails can manage this event — its details, emails, and codes.
          Global admins always have access.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={handleAdd} className="max-w-md">
          <InputGroup>
            <InputGroupInput
              type="email"
              aria-label="Event admin email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="organizer@example.com"
              className="font-mono text-sm"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="submit"
                variant="brand"
                size="xs"
                disabled={submitting}
                aria-busy={submitting}
              >
                <UserPlus data-icon="inline-start" />
                {submitting ? "Adding..." : "Add"}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
        <RowList
          items={admins?.map((a) => ({
            key: a._id,
            label: a.isSelf ? `${a.email} (you)` : a.email,
            onRemove: () =>
              removeAdmin({ id: a._id }).catch((err) =>
                toast.error(
                  err instanceof Error
                    ? err.message
                    : "Failed to remove event admin"
                )
              ),
          }))}
          emptyText="No event admins yet — only global admins can manage this event."
        />
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value }: { label: string; value?: number }) {
  return (
    <Card className="gap-2">
      <CardContent className="flex flex-col gap-3">
        <span className="eyebrow text-muted-foreground">{label}</span>
        <span className="font-heading text-3xl font-semibold tracking-tight tabular-nums">
          {value ?? "—"}
        </span>
      </CardContent>
    </Card>
  );
}

function UploadButton({
  busy,
  onFile,
}: {
  busy: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      aria-busy={busy}
      render={<label />}
      nativeButton={false}
    >
      {busy ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <Upload data-icon="inline-start" />
      )}
      CSV / XLSX
      <input
        type="file"
        accept=".csv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
    </Button>
  );
}

function RowList({
  items,
  emptyText,
}: {
  items?: { key: string; label: string; claimedBy?: string; onRemove?: () => void }[];
  emptyText: string;
}) {
  if (!items) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 rounded-md" />
        <Skeleton className="h-9 rounded-md" />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-dim">
        {emptyText}
      </p>
    );
  }
  return (
    <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
      {items.map((item) => (
        <li
          key={item.key}
          className="flex min-h-10 items-center justify-between gap-3 px-3 py-1.5 transition-colors hover:bg-surface"
        >
          <span className="truncate font-mono text-xs">{item.label}</span>
          {item.claimedBy ? (
            <Badge
              variant="secondary"
              className="max-w-32 shrink-0 truncate font-mono text-[10px] sm:max-w-48"
            >
              <Check data-icon="inline-start" />
              {item.claimedBy}
            </Badge>
          ) : item.onRemove ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${item.label}`}
              onClick={item.onRemove}
              className="shrink-0 text-muted-foreground"
            >
              <X />
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function EventDetailsForm({
  event,
  canDelete,
}: {
  event: Doc<"events">;
  canDelete: boolean;
}) {
  const updateEvent = useMutation(api.events.update);
  const removeEvent = useMutation(api.events.remove);
  const router = useRouter();

  const [name, setName] = useState(event.name);
  const [slug, setSlug] = useState(event.slug);
  const [description, setDescription] = useState(event.description ?? "");
  const [eventDate, setEventDate] = useState(event.eventDate ?? "");
  const [creditAmount, setCreditAmount] = useState(event.creditAmount ?? "");
  const [eventUrl, setEventUrl] = useState(event.eventUrl ?? "");
  const [claimStart, setClaimStart] = useState(
    timestampToLocalInput(event.claimStart)
  );
  const [claimEnd, setClaimEnd] = useState(
    timestampToLocalInput(event.claimEnd)
  );
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { slug: savedSlug } = await updateEvent({
        id: event._id,
        name,
        slug,
        description: description || undefined,
        eventDate: eventDate || undefined,
        creditAmount: creditAmount || undefined,
        eventUrl: eventUrl || undefined,
        claimStart: localInputToTimestamp(claimStart),
        claimEnd: localInputToTimestamp(claimEnd),
      });
      setSlug(savedSlug);
      toast.success("Event saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await removeEvent({ id: event._id });
    toast.success(`Event "${event.name}" deleted`);
    router.push("/admin");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Event details</CardTitle>
        <CardDescription>
          The slug is the public claim URL — changing it moves the page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="flex flex-col gap-6">
          <FieldGroup className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="detail-name">Name</FieldLabel>
              <Input
                id="detail-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="detail-slug">Slug</FieldLabel>
              <Input
                id="detail-slug"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="font-mono"
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="detail-description">Description</FieldLabel>
              <Textarea
                id="detail-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="resize-y"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="detail-date">Event date</FieldLabel>
              <Input
                id="detail-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="font-mono"
              />
              <FieldDescription>
                Optional — shown on the home and claim pages.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="detail-credit">Credit amount</FieldLabel>
              <Input
                id="detail-credit"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                placeholder="$100"
              />
              <FieldDescription>Shown on the claim page.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="detail-claim-start">Claims open</FieldLabel>
              <Input
                id="detail-claim-start"
                type="datetime-local"
                value={claimStart}
                onChange={(e) => setClaimStart(e.target.value)}
                className="font-mono"
              />
              <FieldDescription>
                Optional — claims are blocked before this time.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="detail-claim-end">Claims close</FieldLabel>
              <Input
                id="detail-claim-end"
                type="datetime-local"
                value={claimEnd}
                onChange={(e) => setClaimEnd(e.target.value)}
                className="font-mono"
              />
              <FieldDescription>
                Optional — claims are blocked after this time.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="detail-url">Event URL</FieldLabel>
              <Input
                id="detail-url"
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
          <div className="flex items-center justify-between gap-4">
            <Button type="submit" disabled={saving} aria-busy={saving}>
              {saving ? (
                <>
                  <Spinner data-icon="inline-start" />
                  Saving...
                </>
              ) : (
                "Save changes"
              )}
            </Button>
            {canDelete ? (
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="destructive" />}>
                  <Trash2 data-icon="inline-start" />
                  Delete event
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete “{event.name}”?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the event along with all of its
                      eligible emails and codes. Attendees will no longer be
                      able to claim or re-view their codes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={handleDelete}
                    >
                      Delete event
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
