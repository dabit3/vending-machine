"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Heart,
  LogIn,
  Pencil,
  SearchX,
  Sparkles,
  Trash2,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { SignInButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

type Board = NonNullable<
  ReturnType<typeof useQuery<typeof api.showcase.board>>
>;
type Entry = Board["entries"][number];

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function ShowcasePage({ slug }: { slug: string }) {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const board = useQuery(api.showcase.board, { slug });
  const toggleVote = useMutation(api.showcase.toggleVote);
  const removeEntry = useMutation(api.showcase.remove);
  const [pendingId, setPendingId] = useState<Id<"showcaseEntries"> | null>(null);

  async function handleVote(entry: Entry) {
    if (!board) return;
    if (!isAuthenticated) {
      toast.error("Sign in to vote.");
      return;
    }
    if (!board.canParticipate) {
      toast.error("Only attendees of this event can vote.");
      return;
    }
    setPendingId(entry._id);
    try {
      await toggleVote({ slug, entryId: entry._id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't record your vote");
    } finally {
      setPendingId(null);
    }
  }

  async function handleRemove(entry: Entry) {
    try {
      await removeEntry({ entryId: entry._id });
      toast.success(entry.mine ? "Your entry was withdrawn" : "Entry removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove entry");
    }
  }

  const mine = board?.entries.find((entry) => entry.mine);
  const leaderIds = new Set(
    board?.entries
      .filter((entry) => entry.rank <= 3 && entry.voteCount > 0)
      .map((entry) => entry._id),
  );

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-14">
          {board === undefined ? (
            <BoardSkeleton />
          ) : board === null ? (
            <Empty className="border border-dashed border-border-strong py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX />
                </EmptyMedia>
                <EmptyTitle>Event not found</EmptyTitle>
                <EmptyDescription>
                  There is no event at <span className="font-mono">/{slug}</span>.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
                <div>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="-ml-2 text-muted-foreground"
                    render={<Link href={`/${slug}`} />}
                    nativeButton={false}
                  >
                    <ArrowLeft data-icon="inline-start" />
                    {board.event.name}
                  </Button>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <h1 className="font-heading text-3xl font-semibold tracking-[-0.02em]">
                      Showcase
                    </h1>
                    {board.event.showcaseOpen ? (
                      <Badge variant="secondary" className="gap-1.5">
                        <span
                          className="size-1.5 animate-pulse rounded-full bg-brand motion-reduce:animate-none"
                          aria-hidden
                        />
                        Live
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Closed</Badge>
                    )}
                  </div>
                  <p className="mt-2 max-w-prose text-sm text-muted-foreground">
                    See what attendees built and vote for your crowd
                    favorites. Everyone gets {board.maxVotes} votes; results
                    update live.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {board.viewerIsAdmin ? (
                    <Button
                      variant="outline"
                      render={<Link href={`/admin/events/${board.event._id}`} />}
                      nativeButton={false}
                    >
                      Manage
                    </Button>
                  ) : null}
                  {board.event.showcaseOpen && board.canParticipate ? (
                    <SubmitDialog slug={slug} existing={mine} />
                  ) : null}
                </div>
              </div>

              {!board.event.showcaseOpen ? (
                <Alert className="mb-6">
                  <Trophy />
                  <AlertTitle>
                    {board.entries.length > 0
                      ? "Voting has closed — here are the final standings."
                      : "The showcase isn't open yet. Check back during the event."}
                  </AlertTitle>
                </Alert>
              ) : authLoading ? null : !isAuthenticated ? (
                <Alert className="mb-6">
                  <LogIn />
                  <AlertTitle className="flex flex-wrap items-center justify-between gap-3">
                    <span>Sign in to share your project and vote.</span>
                    <SignInButton mode="modal">
                      <Button size="xs" variant="brand">
                        Sign in
                      </Button>
                    </SignInButton>
                  </AlertTitle>
                </Alert>
              ) : !board.canParticipate ? (
                <Alert className="mb-6">
                  <Sparkles />
                  <AlertTitle>
                    Voting is for attendees of this event. You can still follow
                    along live.
                  </AlertTitle>
                </Alert>
              ) : (
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground tabular-nums">
                      {board.votesRemaining}
                    </span>{" "}
                    of {board.maxVotes} votes left
                  </span>
                  <span className="tabular-nums">
                    {board.entries.length}{" "}
                    {board.entries.length === 1 ? "project" : "projects"} ·{" "}
                    {board.totalVotes} {board.totalVotes === 1 ? "vote" : "votes"}
                  </span>
                </div>
              )}

              {board.entries.length === 0 ? (
                <Empty className="border border-dashed border-border-strong py-16">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Sparkles />
                    </EmptyMedia>
                    <EmptyTitle>Nothing here yet</EmptyTitle>
                    <EmptyDescription>
                      {board.event.showcaseOpen && board.canParticipate
                        ? "Be the first to share what you built."
                        : "Projects will appear here as attendees share them."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {board.entries.map((entry) => (
                    <li key={entry._id} className="flex">
                      <EntryCard
                        entry={entry}
                        leader={leaderIds.has(entry._id)}
                        canVote={board.event.showcaseOpen && board.canParticipate}
                        votesLeft={board.votesRemaining > 0}
                        pending={pendingId === entry._id}
                        canRemove={
                          board.viewerIsAdmin ||
                          (entry.mine && board.event.showcaseOpen)
                        }
                        onVote={() => handleVote(entry)}
                        onRemove={() => handleRemove(entry)}
                      />
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function EntryCard({
  entry,
  leader,
  canVote,
  votesLeft,
  pending,
  canRemove,
  onVote,
  onRemove,
}: {
  entry: Entry;
  leader: boolean;
  canVote: boolean;
  votesLeft: boolean;
  pending: boolean;
  canRemove: boolean;
  onVote: () => void;
  onRemove: () => void;
}) {
  const disabled =
    !canVote || entry.mine || pending || (!entry.voted && !votesLeft);
  return (
    <Card
      className={cn(
        "w-full transition-shadow",
        leader && "border-brand/60 shadow-[0_2px_24px_-8px_var(--brand)]",
      )}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "font-mono text-xs tabular-nums text-muted-foreground",
                leader && "text-brand",
              )}
            >
              #{entry.rank}
            </span>
            {leader ? (
              <Trophy className="size-3.5 text-brand" aria-label="Crowd favorite" />
            ) : null}
            {entry.mine ? (
              <Badge variant="secondary" className="text-[10px]">
                Yours
              </Badge>
            ) : null}
          </div>
          {canRemove ? (
            <Button
              variant="ghost"
              size="icon-xs"
              className="-mt-1 -mr-2 text-muted-foreground"
              onClick={onRemove}
              aria-label={entry.mine ? "Withdraw your entry" : "Remove entry"}
              title={entry.mine ? "Withdraw your entry" : "Remove entry"}
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>
        <CardTitle className="font-heading text-lg text-balance wrap-anywhere">
          {entry.title}
        </CardTitle>
        {entry.email ? (
          <CardDescription className="font-mono text-xs wrap-anywhere">
            {entry.email}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {entry.description ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere text-muted-foreground">
            {entry.description}
          </p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-3">
          {entry.url ? (
            <a
              href={entry.url}
              target="_blank"
              rel="noreferrer"
              className="group flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <span className="truncate">{hostname(entry.url)}</span>
              <ArrowUpRight
                className="size-3 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                aria-hidden
              />
            </a>
          ) : (
            <span />
          )}
          <Button
            variant={entry.voted ? "brand" : "outline"}
            size="sm"
            onClick={onVote}
            disabled={disabled}
            aria-pressed={entry.voted}
            aria-busy={pending}
            aria-label={`${entry.voted ? "Remove vote for" : "Vote for"} ${entry.title}`}
            className="shrink-0 tabular-nums"
          >
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Heart
                data-icon="inline-start"
                className={cn(entry.voted && "fill-current")}
              />
            )}
            {entry.voteCount}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SubmitDialog({
  slug,
  existing,
}: {
  slug: string;
  existing?: Entry;
}) {
  const submit = useMutation(api.showcase.submit);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  function handleOpenChange(next: boolean) {
    if (next) {
      setTitle(existing?.title ?? "");
      setDescription(existing?.description ?? "");
      setUrl(existing?.url ?? "");
    }
    setOpen(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await submit({
        slug,
        title,
        description: description || undefined,
        url: url || undefined,
      });
      toast.success(result.updated ? "Entry updated" : "You're in the showcase");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't submit");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant={existing ? "outline" : "brand"} />}>
        {existing ? (
          <>
            <Pencil data-icon="inline-start" />
            Edit my entry
          </>
        ) : (
          <>
            <Sparkles data-icon="inline-start" />
            Share what you built
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">
            {existing ? "Edit your entry" : "Share what you built"}
          </DialogTitle>
          <DialogDescription>
            One entry per attendee. Other attendees vote for their favorites.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="showcase-title">Project name</FieldLabel>
              <Input
                id="showcase-title"
                required
                maxLength={80}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What did you build?"
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="showcase-description">
                What it does
              </FieldLabel>
              <Textarea
                id="showcase-description"
                rows={4}
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="resize-y"
              />
              <FieldDescription>Optional — a sentence or two.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="showcase-url">Link</FieldLabel>
              <Input
                id="showcase-url"
                type="text"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="github.com/you/project"
              />
              <FieldDescription>Optional — demo, repo, or video.</FieldDescription>
            </Field>
          </FieldGroup>
          <Button
            type="submit"
            variant="brand"
            size="lg"
            className="w-full"
            disabled={saving}
            aria-busy={saving}
          >
            {saving ? (
              <>
                <Spinner data-icon="inline-start" />
                Saving...
              </>
            ) : existing ? (
              "Save changes"
            ) : (
              "Add to showcase"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BoardSkeleton() {
  return (
    <div role="status" aria-label="Loading showcase">
      <Skeleton className="mb-3 h-4 w-32 rounded-sm" />
      <Skeleton className="mb-10 h-9 w-48 rounded-sm" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6"
          >
            <Skeleton className="h-4 w-10 rounded-sm" />
            <Skeleton className="h-6 w-3/4 rounded-sm" />
            <Skeleton className="h-4 w-full rounded-sm" />
            <Skeleton className="h-7 w-16 self-end rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
