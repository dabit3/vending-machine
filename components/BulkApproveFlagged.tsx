"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";
import { bulkApproveFlagged } from "@/lib/bulk-approve-flagged";
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
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export default function BulkApproveFlagged({
  entries,
  hasMore,
  onApprove,
}: {
  entries: readonly { _id: Id<"flaggedEmails"> }[];
  hasMore: boolean;
  onApprove: (args: { id: Id<"flaggedEmails"> }) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const label = hasMore ? "Approve displayed" : "Approve all";

  async function submit() {
    if (running.current || entries.length === 0) return;
    running.current = true;
    setBusy(true);
    setOpen(false);
    try {
      // Snapshot this page: newly revealed entries still need admin review.
      const { approved, failed, skipped } = await bulkApproveFlagged(
        entries.map((entry) => entry._id),
        onApprove,
      );
      if (failed > 0) {
        toast.error(
          `${failed} flagged ${failed === 1 ? "entry" : "entries"} could not be approved`,
          {
            description: `${approved} approved. ${skipped > 0 ? `${skipped} already resolved and skipped. ` : ""}Failed entries remain for review. Blacklisted entries cannot be approved.`,
          },
        );
      } else {
        toast.success(
          `Approved ${approved} flagged ${approved === 1 ? "entry" : "entries"}`,
          skipped > 0
            ? { description: `${skipped} already resolved and skipped.` }
            : undefined,
        );
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={busy || entries.length === 0}
            aria-busy={busy}
          />
        }
      >
        {busy ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <Check data-icon="inline-start" />
        )}
        {busy ? "Approving…" : `${label} (${entries.length})`}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label} flagged entries?</AlertDialogTitle>
          <AlertDialogDescription>
            Add {entries.length} flagged {entries.length === 1 ? "entry" : "entries"}{" "}
            to this event’s eligible list.
            {hasMore
              ? " Only the displayed batch will be approved; the remaining entries will still need review."
              : ""}
            {" "}Blacklisted entries cannot be approved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void submit()}
            disabled={busy || entries.length === 0}
          >
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
