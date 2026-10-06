import { Badge } from "@/components/ui/badge";

export interface AttendeeMatch {
  participant: boolean;
  blocked?: boolean;
  claimedCode?: string;
  claimedAt?: number;
  flagged: boolean;
  blacklistRejected?: boolean;
  accessRequest?: "pending" | "approved" | "denied";
}

// How an attendee relates to one event: claimed, listed, flagged, etc.
export default function AttendeeMatchBadges({
  match,
}: {
  match: AttendeeMatch;
}) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {match.claimedCode ? (
        <span>
          Claimed <span className="font-mono">{match.claimedCode}</span>
          {match.claimedAt
            ? ` · ${new Date(match.claimedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}`
            : null}
        </span>
      ) : match.participant ? (
        <span>On the list, not claimed</span>
      ) : null}
      {match.blocked ? <Badge variant="outline">Blocked</Badge> : null}
      {match.flagged ? <Badge variant="outline">Flagged</Badge> : null}
      {match.blacklistRejected ? (
        <Badge variant="outline">Rejected by blacklist</Badge>
      ) : null}
      {match.accessRequest ? (
        <Badge variant="outline">Access request {match.accessRequest}</Badge>
      ) : null}
    </div>
  );
}
