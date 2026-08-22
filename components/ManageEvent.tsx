"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Ban,
  Check,
  Download,
  Eye,
  Inbox,
  Plus,
  QrCode,
  RotateCcw,
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
import { fileToItems } from "@/lib/spreadsheet";
import { useCountUp } from "@/lib/use-count-up";
import { cn } from "@/lib/utils";
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
  const flagged = useQuery(api.emails.listFlagged, { eventId: id });
  const blacklistHits = useQuery(api.blacklist.listHits, { eventId: id });
  const codes = useQuery(api.codes.list, { eventId: id });
  const access = useQuery(api.admins.accessLevel);
  const addEmails = useMutation(api.emails.add);
  const removeEmail = useMutation(api.emails.remove);
  const approveFlagged = useMutation(api.emails.approveFlagged);
  const rejectFlagged = useMutation(api.emails.rejectFlagged);
  const addCodes = useMutation(api.codes.add);
  const allowReclaim = useMutation(api.claims.allowReclaim);
  const removeCode = useMutation(api.codes.remove);
  const renameCodeType = useMutation(api.codes.renameType);
  const removeCodeType = useMutation(api.codes.removeType);
  const setTypeValue = useMutation(api.codes.setTypeValue);

  const [emailInput, setEmailInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [blockTarget, setBlockTarget] = useState<string | null>(null);
  const [newBlockName, setNewBlockName] = useState("");
  const [newBlockValue, setNewBlockValue] = useState("");
  const [firstBlockName, setFirstBlockName] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [reclaimTarget, setReclaimTarget] = useState<{
    email: string;
    codes: string[];
  } | null>(null);

  // Emails that already claimed, mapped to their claimed code(s), so the
  // eligible-emails list can offer an "allow re-claim" action per address.
  const claimedCodesByEmail = new Map<string, string[]>();
  for (const c of codes ?? []) {
    if (!c.claimedBy) continue;
    claimedCodesByEmail.set(c.claimedBy, [
      ...(claimedCodesByEmail.get(c.claimedBy) ?? []),
      c.code,
    ]);
  }

  // Existing code blocks ("" = unnamed) drive the add form: codes go into a
  // selected existing block, or into a new named block when only one exists.
  // Blocks are ordered by when each was first created, not alphabetically.
  const blockTypes = [
    ...new Set(
      [...(codes ?? [])]
        .sort((a, b) => a._creationTime - b._creationTime)
        .map((c) => c.codeType ?? "")
    ),
  ];
  // Target values are namespaced ("existing:<type>" / "new") so a block
  // whose name matches a sentinel can't be confused with new-block creation.
  const targetOptions = [
    ...blockTypes.map((t) => `existing:${t}`),
    ...(blockTypes.length < 2 ? ["new"] : []),
  ];
  const effectiveTarget =
    blockTarget !== null && targetOptions.includes(blockTarget)
      ? blockTarget
      : (targetOptions[0] ?? "new");
  const isNewBlock = effectiveTarget === "new";
  const selectedType = isNewBlock
    ? null
    : effectiveTarget.slice("existing:".length);
  const hasBlocks = blockTypes.length > 0;
  // A second block requires both blocks to be named, so creating one next to
  // an unnamed block also asks for the existing block's name.
  const needsFirstBlockName =
    isNewBlock && hasBlocks && blockTypes.includes("");
  const codeFormReady =
    (!isNewBlock || !hasBlocks || newBlockName.trim().length > 0) &&
    (!needsFirstBlockName || firstBlockName.trim().length > 0);

  // Computed before the early returns so the count-up hook can run
  // unconditionally; 0 while the codes query is still in flight.
  const claimedCount = codes?.filter((c) => c.claimedBy).length ?? 0;
  const codeCount = codes?.length ?? 0;
  const claimedDisplay = useCountUp(claimedCount);

  // Mirrors the real layout below (header → stat grid → details → two-up →
  // admins) so nothing reorganises itself when the queries land.
  if (event === undefined) {
    return (
      <div
        className="flex flex-col gap-8"
        role="status"
        aria-label="Loading event"
      >
        <div>
          <Skeleton className="h-6 w-24 rounded-md" />
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <Skeleton className="h-9 w-64 max-w-full rounded-md" />
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-8 w-36 rounded-lg" />
              <Skeleton className="h-8 w-28 rounded-lg" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-3 py-5 sm:px-8 sm:first:pl-0 sm:last:pr-0"
            >
              <Skeleton className="h-4 w-24 rounded-sm" />
              <Skeleton className="h-9 w-14 rounded-md" />
            </div>
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
        <div className="grid gap-8 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
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

  // Shares the busy flag with the file upload so the two ways of adding to the
  // same list can't run at once. The textarea is only cleared on success, so a
  // failed paste isn't lost.
  async function handleAddEmails(e: React.FormEvent) {
    e.preventDefault();
    const list = emailInput.split(/[\n,;\s]+/).filter(Boolean);
    if (list.length === 0) return;
    setEmailBusy(true);
    try {
      const { added, skipped, flagged, blacklisted } = await addEmails({
        eventId: id,
        emails: list,
      });
      const description =
        [
          blacklisted ? `${blacklisted} rejected (blacklisted).` : "",
          flagged ? `${flagged} flagged for review (found in past events).` : "",
          skipped ? `Skipped ${skipped} (duplicates/invalid).` : "",
        ]
          .filter(Boolean)
          .join(" ") || undefined;
      if (added === 0 && blacklisted > 0 && flagged === 0) {
        toast.warning(`${blacklisted} emails rejected (blacklisted)`, {
          description,
        });
      } else if (added === 0 && flagged > 0) {
        toast.warning(`${flagged} emails awaiting review`, { description });
      } else {
        toast.success(`Added ${added} emails`, { description });
      }
      setEmailInput("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add emails");
    } finally {
      setEmailBusy(false);
    }
  }

  // Resolves which block incoming codes belong to, naming the existing
  // unnamed block first when a second block is being created next to it.
  async function resolveTargetType(): Promise<string | undefined> {
    if (!isNewBlock) return selectedType || undefined;
    if (needsFirstBlockName) {
      await renameCodeType({ eventId: id, to: firstBlockName.trim() });
    }
    return newBlockName.trim() || undefined;
  }

  function codeRows(type?: string) {
    return codes
      ?.filter((c) => type === undefined || (c.codeType ?? "") === type)
      .map((c) => ({
        key: c._id,
        label: c.code,
        tag: type === undefined ? (c.codeType ?? undefined) : undefined,
        claimedBy: c.claimedBy ?? undefined,
        onRemove: c.claimedBy
          ? undefined
          : () =>
              removeCode({ id: c._id }).catch((err) =>
                toast.error(
                  err instanceof Error ? err.message : "Failed to remove code"
                )
              ),
      }));
  }

  function resetBlockForm(codeType: string | undefined) {
    setBlockTarget(`existing:${codeType ?? ""}`);
    setNewBlockName("");
    setNewBlockValue("");
    setFirstBlockName("");
  }

  async function handleAddCodes(e: React.FormEvent) {
    e.preventDefault();
    const list = codeInput.split(/[\n,;\s]+/).filter(Boolean);
    if (list.length === 0 || !codeFormReady) return;
    setCodeBusy(true);
    try {
      const codeType = await resolveTargetType();
      const { added, skipped } = await addCodes({
        eventId: id,
        codes: list,
        codeType,
        value: isNewBlock ? newBlockValue.trim() || undefined : undefined,
      });
      toast.success(`Added ${added} codes`, {
        description: skipped ? `Skipped ${skipped} (duplicates).` : undefined,
      });
      setCodeInput("");
      resetBlockForm(codeType);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add codes");
    } finally {
      setCodeBusy(false);
    }
  }

  async function handleCodeFile(file: File) {
    if (!codeFormReady) {
      toast.error(
        needsFirstBlockName && !firstBlockName.trim()
          ? "Name the existing block before uploading a second block."
          : "Name the new block before uploading its codes."
      );
      return;
    }
    // The rename of an unnamed existing block is deferred until the file has
    // actually produced codes to import, so an empty or unreadable upload
    // leaves the current block untouched.
    let codeType: string | undefined;
    let resolved = false;
    await importFile(
      file,
      "codes",
      async (items) => {
        if (!resolved) {
          codeType = await resolveTargetType();
          resolved = true;
        }
        return addCodes({
          eventId: id,
          codes: items,
          codeType,
          value: isNewBlock ? newBlockValue.trim() || undefined : undefined,
        });
      },
      setCodeBusy
    );
    if (resolved) resetBlockForm(codeType);
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
      ["code", "type", "claimed_by", "claimed_at"],
      ...codes.map((c) => [
        c.code,
        c.codeType ?? "",
        c.claimedBy ?? "",
        c.claimedAt ? new Date(c.claimedAt).toISOString() : "",
      ]),
    ]);
  }

  async function importFile(
    file: File,
    kind: "emails" | "codes",
    send: (
      items: string[]
    ) => Promise<{
      added: number;
      skipped: number;
      flagged?: number;
      blacklisted?: number;
    }>,
    setBusy: (busy: boolean) => void
  ) {
    setBusy(true);
    const toastId = toast.loading(`Reading ${file.name}...`);
    try {
      const rows = await fileToItems(file, kind);
      // Dedupe up front so repeats split across upload chunks aren't
      // double-counted by the server.
      const items = [
        ...new Set(
          rows.map((r) => (kind === "emails" ? r.trim().toLowerCase() : r.trim()))
        ),
      ];
      const dropped = rows.length - items.length;
      if (items.length === 0) {
        toast.warning(`Nothing to import found in ${file.name}`, { id: toastId });
        return;
      }
      let added = 0;
      let skipped = dropped;
      let flagged = 0;
      let blacklisted = 0;
      for (let i = 0; i < items.length; i += UPLOAD_CHUNK_SIZE) {
        toast.loading(
          `Uploading ${Math.min(i + UPLOAD_CHUNK_SIZE, items.length)} / ${items.length}...`,
          { id: toastId }
        );
        const res = await send(items.slice(i, i + UPLOAD_CHUNK_SIZE));
        added += res.added;
        skipped += res.skipped;
        flagged += res.flagged ?? 0;
        blacklisted += res.blacklisted ?? 0;
      }
      const description =
        [
          blacklisted ? `${blacklisted} rejected (blacklisted).` : "",
          flagged ? `${flagged} flagged for review (found in past events).` : "",
          skipped ? `Skipped ${skipped} duplicates or invalid rows.` : "",
        ]
          .filter(Boolean)
          .join(" ") || undefined;
      if (added === 0 && blacklisted > 0 && flagged === 0) {
        toast.warning(`${blacklisted} from ${file.name} rejected (blacklisted)`, {
          id: toastId,
          description,
        });
      } else if (added === 0 && flagged > 0) {
        toast.warning(`${flagged} from ${file.name} awaiting review`, {
          id: toastId,
          description,
        });
      } else {
        toast.success(`Added ${added} from ${file.name}`, {
          id: toastId,
          description,
        });
      }
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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              render={<Link href={`/admin/events/${id}/walkup`} />}
              nativeButton={false}
            >
              <QrCode data-icon="inline-start" />
              Walk-up claim
            </Button>
            <Button
              variant="outline"
              render={
                <Link
                  href={`/${event.slug}?preview=1`}
                  target="_blank"
                  rel="noreferrer"
                />
              }
              nativeButton={false}
            >
              <Eye data-icon="inline-start" />
              Preview claim
            </Button>
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
      </div>

      <div className="grid grid-cols-1 divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <StatCard label="Eligible emails" value={emails?.length} />
        <StatCard label="Codes in pool" value={codes?.length} />
        <div className="flex flex-col gap-3 py-5 sm:px-8 sm:last:pr-0">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Claimed
            </span>
            {codes ? (
              <span className="font-mono text-xs text-muted-dim tabular-nums">
                {codeCount > 0
                  ? `${Math.round((claimedCount / codeCount) * 100)}%`
                  : "—"}
              </span>
            ) : null}
          </div>
          {codes ? (
            <div className="font-heading text-3xl font-semibold tracking-tight tabular-nums">
              {claimedDisplay}
              <span className="text-base text-muted-dim"> / {codeCount}</span>
            </div>
          ) : (
            <Skeleton className="h-9 w-20 rounded-md" />
          )}
          <Progress
            value={codeCount > 0 ? (claimedCount / codeCount) * 100 : 0}
            className="w-full"
          />
        </div>
      </div>

      <EventDetailsForm
        key={event._id}
        event={event}
        canDelete={access?.isGlobalAdmin ?? false}
      />

      {blacklistHits && blacklistHits.length > 0 ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ban className="size-4 text-destructive" aria-hidden />
              Blacklisted
              <Badge variant="secondary">{blacklistHits.length}</Badge>
            </CardTitle>
            <CardDescription>
              These uploaded emails are on the app-wide blacklist and were
              rejected. Only global admins can manage the blacklist.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="max-h-96 divide-y divide-border overflow-y-auto border-y border-border">
              {blacklistHits.map((hit) => (
                <li
                  key={hit._id}
                  className="flex min-h-10 items-center px-1 py-2 transition-colors hover:bg-surface"
                >
                  <span className="truncate text-sm">{hit.email}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {flagged && flagged.entries.length > 0 ? (
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-500" aria-hidden />
              Flagged for review
              <Badge variant="secondary">
                {flagged.entries.length}
                {flagged.hasMore ? "+" : ""}
              </Badge>
            </CardTitle>
            <CardDescription>
              These uploaded emails already signed up for previous events.
              Approve each one individually to add it to the eligible list, or
              reject it to discard it.
              {flagged.hasMore
                ? " Showing the first batch; more will appear as these are resolved."
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="max-h-96 divide-y divide-border overflow-y-auto border-y border-border">
              {flagged.entries.map((f) => (
                <li
                  key={f._id}
                  className="flex min-h-12 flex-wrap items-center justify-between gap-3 px-1 py-2 transition-colors hover:bg-surface"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">{f.email}</span>
                    <span className="truncate text-xs text-muted-dim">
                      Also in:{" "}
                      {[
                        f.matchedEvents.map((e) => e.name).join(", "),
                        f.otherMatchCount > 0
                          ? `${f.otherMatchCount} other event(s)`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(", ") || "no longer on another event's list"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        approveFlagged({ id: f._id })
                          .then(() => toast.success(`Approved ${f.email}`))
                          .catch((err) =>
                            toast.error(
                              err instanceof Error &&
                                err.message.includes("blacklisted")
                                ? `${f.email} is blacklisted and cannot be added`
                                : "Failed to approve"
                            )
                          )
                      }
                    >
                      <Check data-icon="inline-start" />
                      Approve
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() =>
                        rejectFlagged({ id: f._id })
                          .then(() => toast.success(`Rejected ${f.email}`))
                          .catch(() => toast.error("Failed to reject"))
                      }
                    >
                      <X data-icon="inline-start" />
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

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
          <CardContent className="flex flex-col gap-4 lg:h-0 lg:grow">
            <form onSubmit={handleAddEmails} className="flex flex-col gap-3">
              <Textarea
                aria-label="Email addresses to add"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                rows={4}
                placeholder={"one@example.com\ntwo@example.com"}
                className="resize-y text-sm"
              />
              <Button
                type="submit"
                variant="secondary"
                className="self-start"
                disabled={emailBusy || !emailInput.trim()}
                aria-busy={emailBusy}
              >
                {emailBusy ? (
                  <>
                    <Spinner data-icon="inline-start" />
                    Adding...
                  </>
                ) : (
                  "Add emails"
                )}
              </Button>
            </form>
            <RowList
              fill
              items={emails?.map((e) => ({
                key: e._id,
                label: e.email,
                onReclaim: claimedCodesByEmail.has(e.email)
                  ? () =>
                      setReclaimTarget({
                        email: e.email,
                        codes: claimedCodesByEmail.get(e.email) ?? [],
                      })
                  : undefined,
                onRemove: () =>
                  removeEmail({ id: e._id }).catch(() =>
                    toast.error("Failed to remove email")
                  ),
              }))}
              emptyText="No emails yet."
            />
            <AlertDialog
              open={reclaimTarget !== null}
              onOpenChange={(open) => {
                if (!open) setReclaimTarget(null);
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Let {reclaimTarget?.email} claim again?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This deletes the code they already claimed (
                    {reclaimTarget?.codes.join(", ")}) so they can claim a
                    fresh one. Use this when the dispensed code had an issue —
                    the old code will not return to the pool.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      const target = reclaimTarget;
                      setReclaimTarget(null);
                      if (!target) return;
                      allowReclaim({ eventId: id, email: target.email })
                        .then(() =>
                          toast.success(
                            `${target.email} can now claim a new code`
                          )
                        )
                        .catch((err) =>
                          toast.error(
                            err instanceof Error
                              ? err.message
                              : "Failed to allow re-claim"
                          )
                        );
                    }}
                  >
                    <RotateCcw data-icon="inline-start" />
                    Allow re-claim
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
              <UploadButton busy={codeBusy} onFile={handleCodeFile} />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CodeBlocks
              codes={codes}
              values={event.codeTypeValues}
              onSetValue={(codeType, value) =>
                setTypeValue({ eventId: id, codeType, value })
              }
              onRename={async (from, to) => {
                await renameCodeType({ eventId: id, from, to });
                // Keep the selection (and the filtered list) on the block
                // that was just renamed.
                setBlockTarget((prev) =>
                  prev === `existing:${from ?? ""}` ? `existing:${to}` : prev
                );
              }}
              canDelete={(event.codeTypes ?? []).length === 2}
              onDelete={async (codeType) => {
                const res = await removeCodeType({ eventId: id, codeType });
                setBlockTarget((prev) =>
                  prev === `existing:${codeType ?? ""}` ? null : prev
                );
                return res;
              }}
            />
            <form onSubmit={handleAddCodes} className="flex flex-col gap-3">
              {hasBlocks ? (
                <Field>
                  <FieldLabel>Add codes to</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    {blockTypes.map((t) => (
                      <Button
                        key={t || "__unnamed"}
                        type="button"
                        size="sm"
                        variant={
                          !isNewBlock && selectedType === t
                            ? "secondary"
                            : "outline"
                        }
                        onClick={() => setBlockTarget(`existing:${t}`)}
                      >
                        {t || "Unnamed block"}
                      </Button>
                    ))}
                    {blockTypes.length < 2 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={isNewBlock ? "secondary" : "outline"}
                        onClick={() => setBlockTarget("new")}
                      >
                        <Plus data-icon="inline-start" />
                        Second code block
                      </Button>
                    ) : null}
                  </div>
                  <FieldDescription>
                    {blockTypes.length < 2
                      ? "Events can have up to two code blocks — attendees pick one by name when there are two."
                      : "This event has both code blocks — pasted and uploaded codes go into the selected one."}
                  </FieldDescription>
                </Field>
              ) : null}
              {!hasBlocks || isNewBlock ? (
                <Field>
                  <FieldLabel htmlFor="new-block-name">
                    {hasBlocks ? "Second block name" : "Code name"}
                  </FieldLabel>
                  <Input
                    id="new-block-name"
                    value={newBlockName}
                    onChange={(e) => setNewBlockName(e.target.value)}
                    placeholder="e.g. $50 credits"
                    className="text-sm"
                  />
                  <FieldDescription>
                    {hasBlocks
                      ? "Required — attendees choose between the two blocks by name."
                      : "Optional with a single code block. Applies to pasted and uploaded codes."}
                  </FieldDescription>
                </Field>
              ) : null}
              {!hasBlocks || isNewBlock ? (
                <Field>
                  <FieldLabel htmlFor="new-block-value">Value</FieldLabel>
                  <Input
                    id="new-block-value"
                    value={newBlockValue}
                    onChange={(e) => setNewBlockValue(e.target.value)}
                    placeholder="e.g. 100 or Team plan"
                    className="text-sm"
                  />
                  <FieldDescription>
                    Optional — shown on the claim page. Numbers get a
                    &ldquo;$&rdquo; prefix; anything else is shown as-is.
                  </FieldDescription>
                </Field>
              ) : null}
              {needsFirstBlockName ? (
                <Field>
                  <FieldLabel htmlFor="first-block-name">
                    Name the existing block
                  </FieldLabel>
                  <Input
                    id="first-block-name"
                    value={firstBlockName}
                    onChange={(e) => setFirstBlockName(e.target.value)}
                    placeholder="e.g. $25 credits"
                    className="text-sm"
                  />
                  <FieldDescription>
                    Your current codes are unnamed — give them a name so
                    attendees can tell the two blocks apart.
                  </FieldDescription>
                </Field>
              ) : null}
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
                disabled={codeBusy || !codeInput.trim() || !codeFormReady}
                aria-busy={codeBusy}
              >
                {codeBusy ? (
                  <>
                    <Spinner data-icon="inline-start" />
                    Adding...
                  </>
                ) : (
                  "Add codes"
                )}
              </Button>
            </form>
            {blockTypes.length > 1 ? (
              // The "Add codes to" selection doubles as the list filter, so
              // one toggle controls both where codes go and which are shown.
              <RowList
                mono
                items={codeRows(selectedType ?? blockTypes[0])}
                emptyText="No codes in this block yet."
              />
            ) : (
              <RowList mono items={codeRows()} emptyText="No codes yet." />
            )}
          </CardContent>
        </Card>
      </div>

      <EventAdminsCard eventId={id} />
    </div>
  );
}

function CodeBlocks({
  codes,
  values,
  onRename,
  onSetValue,
  canDelete,
  onDelete,
}: {
  codes: Doc<"codes">[] | undefined;
  values: Record<string, string> | undefined;
  onRename: (from: string | undefined, to: string) => Promise<unknown>;
  onSetValue: (
    codeType: string | undefined,
    value: string | undefined
  ) => Promise<unknown>;
  canDelete: boolean;
  onDelete: (
    codeType: string | undefined
  ) => Promise<{ removed: number; kept: number }>;
}) {
  // Map insertion order follows creation time, so blocks list in the order
  // they were first created rather than alphabetically.
  const blocks = new Map<string, number>();
  for (const c of [...(codes ?? [])].sort(
    (a, b) => a._creationTime - b._creationTime
  )) {
    const key = c.codeType ?? "";
    blocks.set(key, (blocks.get(key) ?? 0) + 1);
  }
  if (blocks.size === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {[...blocks.entries()].map(([type, count]) => (
          <CodeBlockRow
            key={type || "__unnamed"}
            type={type}
            count={count}
            value={values?.[type]}
            onRename={onRename}
            onSetValue={onSetValue}
            canDelete={canDelete}
            onDelete={onDelete}
          />
        ))}
    </div>
  );
}

function CodeBlockRow({
  type,
  count,
  value,
  onRename,
  onSetValue,
  canDelete,
  onDelete,
}: {
  type: string;
  count: number;
  value?: string;
  onRename: (from: string | undefined, to: string) => Promise<unknown>;
  onSetValue: (
    codeType: string | undefined,
    value: string | undefined
  ) => Promise<unknown>;
  canDelete: boolean;
  onDelete: (
    codeType: string | undefined
  ) => Promise<{ removed: number; kept: number }>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(type);
  const [valueInput, setValueInput] = useState(value ?? "");
  const [busy, setBusy] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const to = name.trim();
    const newValue = valueInput.trim();
    const renaming = to !== "" && to !== type;
    const valueChanged = newValue !== (value ?? "");
    if (!renaming && !valueChanged) {
      setEditing(false);
      setName(type);
      setValueInput(value ?? "");
      return;
    }
    setBusy(true);
    try {
      if (renaming) {
        await onRename(type || undefined, to);
        toast.success(
          type ? `Renamed “${type}” to “${to}”` : `Named code block “${to}”`
        );
      }
      if (valueChanged) {
        await onSetValue(
          (renaming ? to : type) || undefined,
          newValue || undefined
        );
        toast.success(newValue ? "Block value saved" : "Block value cleared");
      }
      setEditing(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update code block"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
      {editing ? (
        <form
          onSubmit={handleSave}
          className="flex flex-1 flex-wrap items-center gap-2"
        >
          <Input
            autoFocus
            aria-label="Code block name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. $50 credits"
            className="h-7 max-w-48 text-sm"
          />
          <Input
            aria-label="Code block value"
            value={valueInput}
            onChange={(e) => setValueInput(e.target.value)}
            placeholder="Value, e.g. 100 or Team plan"
            className="h-7 max-w-48 text-sm"
          />
          <Button type="submit" size="xs" variant="secondary" disabled={busy}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Save
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => {
              setEditing(false);
              setName(type);
              setValueInput(value ?? "");
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <>
          <Badge variant={type ? "secondary" : "outline"}>
            {type || "Unnamed"}
          </Badge>
          <span className="text-xs text-muted-dim tabular-nums">
            {count} code{count === 1 ? "" : "s"}
          </span>
          {value ? (
            <span className="max-w-40 truncate text-xs text-muted-foreground">
              {value}
            </span>
          ) : null}
          <Button
            size="xs"
            variant="ghost"
            className="ml-auto text-muted-foreground"
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
          {canDelete ? (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground"
                    aria-label={`Delete block ${type || "Unnamed"}`}
                  />
                }
              >
                <Trash2 />
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete the &ldquo;{type || "Unnamed"}&rdquo; block?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the block and all of its unclaimed codes.
                    Codes already dispensed are kept, so attendees keep their
                    claim status and can still see their code.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      onDelete(type || undefined)
                        .then(({ removed, kept }) =>
                          toast.success(
                            `Deleted block${type ? ` “${type}”` : ""} — ${removed} unclaimed code${removed === 1 ? "" : "s"} removed${kept > 0 ? `, ${kept} claimed kept` : ""}`
                          )
                        )
                        .catch((err) =>
                          toast.error(
                            err instanceof Error
                              ? err.message
                              : "Failed to delete code block"
                          )
                        );
                    }}
                  >
                    Delete block
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </>
      )}
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
  const display = useCountUp(value ?? 0);
  return (
    <div className="flex flex-col gap-3 py-5 sm:px-8 sm:first:pl-0">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {value === undefined ? (
        <Skeleton className="h-9 w-14 rounded-md" />
      ) : (
        <span className="font-heading text-3xl font-semibold tracking-tight tabular-nums">
          {display}
        </span>
      )}
    </div>
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
  mono,
  fill,
}: {
  items?: {
    key: string;
    label: string;
    tag?: string;
    claimedBy?: string;
    onReclaim?: () => void;
    onRemove?: () => void;
  }[];
  emptyText: string;
  mono?: boolean;
  // Grow to take the remaining height of a flex parent (scrolling inside)
  // instead of capping at a fixed max height.
  fill?: boolean;
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
    <ul
      className={cn(
        "divide-y divide-border overflow-y-auto border-y border-border",
        // grow + h-0 (not flex-1) so the list's flex basis is 0 rather than
        // 0% — a percentage basis in an indefinite-height column falls back
        // to content size, letting a long list grow the page instead of
        // scrolling within the space left by the taller sibling card.
        // Only zero the basis on lg, where the grid row is stretched by the
        // sibling card; in the single-column stack nothing stretches the row,
        // so a zero height would collapse the card entirely.
        fill ? "max-h-72 lg:h-0 lg:max-h-none lg:min-h-56 lg:grow" : "max-h-72"
      )}
    >
      {items.map((item) => (
        <li
          key={item.key}
          className="flex min-h-10 items-center justify-between gap-3 px-1 py-1.5 transition-colors hover:bg-surface"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn("truncate text-sm", mono && "font-mono text-xs")}
            >
              {item.label}
            </span>
            {item.tag ? (
              <Badge
                variant="outline"
                className="max-w-24 shrink-0 truncate text-[10px] sm:max-w-40"
              >
                {item.tag}
              </Badge>
            ) : null}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {item.onReclaim ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Allow ${item.label} to claim again`}
                title="Allow re-claim"
                onClick={item.onReclaim}
                className="shrink-0 text-muted-foreground"
              >
                <RotateCcw />
              </Button>
            ) : null}
            {item.claimedBy ? (
              <Badge
                variant="secondary"
                className="max-w-32 shrink-0 truncate text-[10px] sm:max-w-48"
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
          </span>
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
  const [claimInstructions, setClaimInstructions] = useState(
    event.claimInstructions ?? ""
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
        claimInstructions: claimInstructions || undefined,
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
              />
              <FieldDescription>
                Optional — shown on the home and claim pages.
              </FieldDescription>
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="detail-instructions">
                Redemption instructions
              </FieldLabel>
              <Textarea
                id="detail-instructions"
                value={claimInstructions}
                onChange={(e) => setClaimInstructions(e.target.value)}
                rows={4}
                className="resize-y"
              />
              <FieldDescription>
                Optional — when set, attendees see a &ldquo;How to
                redeem&rdquo; button after claiming their code.
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
