"use client";

import { ScrollText } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const ACTION_LABELS: Record<string, string> = {
  request_submitted: "Request submitted",
  request_resubmitted: "Request resubmitted",
  request_approved: "Approved",
  request_denied: "Denied",
};

export default function AuditLogCard({ eventId }: { eventId: Id<"events"> }) {
  const logs = useQuery(api.auditLogs.listByEvent, { eventId });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="size-4 text-muted-dim" aria-hidden />
          Audit log
        </CardTitle>
        <CardDescription>
          Access-request activity for this event, newest first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {logs === undefined ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 rounded-md" />
            <Skeleton className="h-9 rounded-md" />
          </div>
        ) : logs.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-dim">
            No activity yet.
          </p>
        ) : (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {logs.map((log) => (
              <li
                key={log._id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {ACTION_LABELS[log.action] ?? log.action}
                    </Badge>
                    {log.subjectEmail ? (
                      <span className="truncate font-mono text-xs">
                        {log.subjectEmail}
                      </span>
                    ) : null}
                  </span>
                  {log.details ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {log.details}
                    </span>
                  ) : null}
                </div>
                <span className="shrink-0 font-mono text-[10px] text-muted-dim">
                  {log.actor} · {new Date(log._creationTime).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
