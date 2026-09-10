"use client";

import { useState } from "react";
import Link from "next/link";
import { usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowRight, Plus, Ticket } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { BatchLibraryFilter } from "@/convex/stripeBatches";
import { usd } from "@/lib/stripe-form";
import { StripeModeBadge } from "@/components/StripeGenerationFields";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type LibraryBatch = FunctionReturnType<
  typeof api.stripeBatches.history
>["page"][number];

const filters: { value: BatchLibraryFilter; label: string; empty: string }[] = [
  { value: "all", label: "All blocks", empty: "No code blocks yet" },
  { value: "available", label: "Available", empty: "No available code blocks" },
  { value: "assigned", label: "Assigned", empty: "No assigned code blocks" },
  { value: "attention", label: "Attention", empty: "No blocks need attention" },
];

export default function CodeBlockLibrary() {
  const [filter, setFilter] = useState<BatchLibraryFilter>("all");
  const { results, status, loadMore } = usePaginatedQuery(
    api.stripeBatches.history,
    { filter },
    { initialNumItems: 25 },
  );
  const loading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore" || status === "LoadingMore";

  return (
    <Tabs
      value={filter}
      onValueChange={(value) => setFilter(value as BatchLibraryFilter)}
      className="gap-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList aria-label="Filter code blocks">
          {filters.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {!loading && (
          <span className="text-xs text-muted-foreground">
            {results.length}
            {canLoadMore ? "+" : ""} code block{results.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <TabsContent value={filter} className="flex flex-col gap-5">
        {loading ? (
          <div
            className="flex flex-col gap-3"
            role="status"
            aria-label="Loading code blocks"
          >
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <Empty className="border border-dashed py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Ticket />
              </EmptyMedia>
              <EmptyTitle>
                {canLoadMore
                  ? "No matching blocks loaded"
                  : filters.find((item) => item.value === filter)?.empty}
              </EmptyTitle>
              <EmptyDescription>
                {canLoadMore
                  ? "Load more blocks to continue browsing this filter."
                  : filter === "all" || filter === "available"
                    ? "Create a code block without an event. Its codes are saved automatically here, ready to use in an event later."
                    : "Your saved blocks remain in All blocks. Open any block to view its codes and event assignment."}
              </EmptyDescription>
            </EmptyHeader>
            {(filter === "all" || filter === "available") && (
              <EmptyContent>
                <Link href="/admin/codes/new" className={buttonVariants()}>
                  <Plus data-icon="inline-start" />
                  New code block
                </Link>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <ItemGroup aria-label="Saved code blocks" className="gap-3">
            {results.map((batch) => (
              <div key={batch._id} role="listitem">
                <CodeBlockRow batch={batch} />
              </div>
            ))}
          </ItemGroup>
        )}
        {canLoadMore && (
          <Button
            variant="outline"
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(25)}
          >
            {status === "LoadingMore" && <Spinner data-icon="inline-start" />}
            {status === "LoadingMore"
              ? "Loading blocks…"
              : "Load more code blocks"}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          All Stripe blocks generated in this app appear here, including
          assigned blocks. Counts show generated codes, not Stripe redemptions.
        </p>
      </TabsContent>
    </Tabs>
  );
}

function CodeBlockRow({ batch }: { batch: LibraryBatch }) {
  const generating = batch.status === "queued" || batch.status === "running";
  const attention = batch.status === "failed" || !!batch.error;
  const status = attention
    ? "Needs attention"
    : generating
      ? "Generating"
      : batch.expired
        ? "Expired"
        : "Ready";
  const assignment = batch.eventId
    ? batch.eventName
      ? `Assigned to ${batch.eventName}`
      : "Assigned · event deleted"
    : batch.targetEventId
      ? batch.eventName
        ? `For ${batch.eventName}`
        : "Target event deleted"
      : "Unassigned";

  return (
    <Item
      variant="outline"
      render={<Link href={`/admin/codes?batch=${batch._id}`} />}
    >
      <ItemContent className="min-w-0 basis-full sm:basis-0">
        <ItemTitle>{batch.name}</ItemTitle>
        <ItemDescription>
          {batch.generatedCount} / {batch.quantity} codes saved ·{" "}
          {usd(batch.amountCents)} per redemption · Redeem {batch.redemptionsPerCode === 2 ? "twice" : "once"} per code ·{" "}
          {batch.expiresAt
            ? `Expires ${new Date(batch.expiresAt).toLocaleDateString()}`
            : "No expiration"}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="w-full flex-wrap sm:w-auto">
        <StripeModeBadge live={batch.live} />
        <Badge variant={attention ? "destructive" : "secondary"}>
          {generating && <Spinner data-icon="inline-start" />}
          {status}
        </Badge>
        <ArrowRight aria-hidden />
      </ItemActions>
      <ItemFooter className="flex-wrap">
        <span className="text-xs text-muted-foreground">{assignment}</span>
        <span className="max-w-full truncate text-xs text-muted-foreground">
          {new Date(batch._creationTime).toLocaleDateString()} ·{" "}
          {batch.createdBy}
        </span>
      </ItemFooter>
    </Item>
  );
}
