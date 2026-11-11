"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronRight, Upload, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { bulkAddSummary, extractAdminEmails } from "@/lib/admin-emails";
import { MAX_BULK_ADMINS } from "@/lib/organizer-emails";
import { fileToItems } from "@/lib/spreadsheet";
import { cn } from "@/lib/utils";

// Collapsed "Add several at once" section used by the Organizers card and
// the system Admins page. Accepts a pasted list (notes between the addresses
// are fine) or a CSV / TXT / XLSX file, and sends every email found.
export default function BulkAdminAdd({
  noun,
  onAdd,
  className,
}: {
  // "organizers" or "admins", for copy.
  noun: string;
  onAdd: (emails: string[]) => Promise<{ added: number; skipped: number }>;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const emails = extractAdminEmails(text);
  const tooMany = emails.length > MAX_BULK_ADMINS;

  async function submit(list: string[], source: string) {
    if (list.length === 0) {
      toast.warning(`No email addresses found in ${source}`);
      return;
    }
    if (list.length > MAX_BULK_ADMINS) {
      toast.error(`Add at most ${MAX_BULK_ADMINS} ${noun} at a time`, {
        description: `${source} has ${list.length} addresses.`,
      });
      return;
    }
    setBusy(true);
    try {
      toast.success(bulkAddSummary(await onAdd(list), noun));
      setText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to add ${noun}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const list = await fileToItems(file, "emails");
      setBusy(false);
      await submit(list, file.name);
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error ? err.message : `Could not read ${file.name}`);
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="size-3.5" aria-hidden />
        ) : (
          <ChevronRight className="size-3.5" aria-hidden />
        )}
        Add several at once
      </button>
      {open ? (
        <form
          id={`${id}-panel`}
          onSubmit={(e) => {
            e.preventDefault();
            void submit(emails, "the list");
          }}
          className="flex flex-col gap-2"
        >
          <Textarea
            id={`${id}-text`}
            aria-label={`Email addresses of ${noun} to add`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            disabled={busy}
            placeholder={`# Speakers\nalex@example.com\nsam@example.com\n\n# Volunteers (notes between addresses are ignored)\nJordan Lee <jordan@example.com>`}
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={busy || emails.length === 0 || tooMany}
              aria-busy={busy}
            >
              {busy ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <UserPlus data-icon="inline-start" />
              )}
              {emails.length > 0
                ? `Add ${emails.length} ${emails.length === 1 ? noun.replace(/s$/, "") : noun}`
                : `Add ${noun}`}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              render={<label />}
              nativeButton={false}
            >
              <Upload data-icon="inline-start" />
              CSV / XLSX
              <input
                type="file"
                accept=".csv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleFile(file);
                }}
              />
            </Button>
            <span
              className={cn(
                "text-xs text-muted-dim",
                tooMany && "text-destructive"
              )}
            >
              {tooMany
                ? `At most ${MAX_BULK_ADMINS} at a time`
                : "One per line, or separated by commas. Lines without an email are skipped."}
            </span>
          </div>
        </form>
      ) : null}
    </div>
  );
}
