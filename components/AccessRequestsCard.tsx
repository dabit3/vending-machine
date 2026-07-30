"use client";

import { useState } from "react";
import { Check, MailQuestion, X } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function statusBadge(status: "pending" | "approved" | "denied") {
  if (status === "approved") {
    return <Badge variant="secondary">Approved</Badge>;
  }
  if (status === "denied") {
    return <Badge variant="outline">Denied</Badge>;
  }
  return <Badge>Pending</Badge>;
}

export default function AccessRequestsCard({
  eventId,
}: {
  eventId: Id<"events">;
}) {
  const requests = useQuery(api.accessRequests.listByEvent, { eventId });
  const approve = useMutation(api.accessRequests.approve);
  const deny = useMutation(api.accessRequests.deny);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pending = requests?.filter((r) => r.status === "pending") ?? [];
  const decided = requests?.filter((r) => r.status !== "pending") ?? [];

  async function handleApprove(id: Id<"accessRequests">, email: string) {
    setBusyId(id);
    try {
      const { codeReserved, alreadyClaimed } = await approve({ id });
      toast.success(`${email} approved and whitelisted`, {
        description: alreadyClaimed
          ? "They already hold a claimed code."
          : codeReserved
            ? "A code has been reserved for them."
            : "No unreserved codes were left to hold — add more codes.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeny(id: Id<"accessRequests">, email: string) {
    setBusyId(id);
    try {
      await deny({ id });
      toast.success(`Request from ${email} denied`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deny");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailQuestion className="size-4 text-muted-dim" aria-hidden />
          Access requests
          {pending.length > 0 ? (
            <Badge className="tabular-nums">{pending.length}</Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          Attendees not on the list can request access. Approving whitelists
          them, reserves a code, and emails them.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {requests === undefined ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 rounded-md" />
            <Skeleton className="h-9 rounded-md" />
          </div>
        ) : requests.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-dim">
            No access requests yet.
          </p>
        ) : (
          <>
            {pending.length > 0 ? (
              <ul className="divide-y divide-border rounded-md border border-border">
                {pending.map((r) => (
                  <li
                    key={r._id}
                    className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-surface"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-mono text-xs">
                        {r.email}
                      </span>
                      {r.message ? (
                        <span className="truncate text-xs text-muted-foreground">
                          &ldquo;{r.message}&rdquo;
                        </span>
                      ) : null}
                      <span className="font-mono text-[10px] text-muted-dim">
                        {new Date(r.requestedAt ?? r._creationTime).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="brand"
                        size="sm"
                        disabled={busyId === r._id}
                        aria-busy={busyId === r._id}
                        onClick={() => handleApprove(r._id, r.email)}
                      >
                        <Check data-icon="inline-start" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === r._id}
                        onClick={() => handleDeny(r._id, r.email)}
                      >
                        <X data-icon="inline-start" />
                        Deny
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-dim">
                No pending requests.
              </p>
            )}
            {decided.length > 0 ? (
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Decided requests ({decided.length})
                </summary>
                <ul className="mt-2 max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
                  {decided.map((r) => (
                    <li
                      key={r._id}
                      className="flex min-h-10 items-center justify-between gap-3 px-3 py-1.5"
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate font-mono text-xs">
                          {r.email}
                        </span>
                        <span className="font-mono text-[10px] text-muted-dim">
                          {r.decidedBy ? `by ${r.decidedBy}` : ""}
                          {r.decidedAt
                            ? ` · ${new Date(r.decidedAt).toLocaleString()}`
                            : ""}
                        </span>
                      </div>
                      {statusBadge(r.status)}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
