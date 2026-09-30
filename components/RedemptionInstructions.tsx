"use client";

import { useState } from "react";
import { Check, Copy, ListChecks } from "lucide-react";
import { toast } from "sonner";
import {
  ClaimInstructions,
  claimInstructionsCopyText,
} from "@/components/ClaimInstructions";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";

// Redemption instructions in a card with a copy button, for the claim page
// dialogs.
export function RedemptionInstructions({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyText(claimInstructionsCopyText(value));
    if (!ok) {
      toast.error("Couldn't copy automatically", {
        description: "Select the instructions and copy them manually.",
      });
      return;
    }
    setCopied(true);
    toast.success("Instructions copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 py-1.5 pr-1.5 pl-3.5">
        <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <ListChecks className="size-3.5" aria-hidden />
          Steps to redeem
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          aria-label={copied ? "Instructions copied" : "Copy instructions"}
        >
          {copied ? (
            <Check data-icon="inline-start" />
          ) : (
            <Copy data-icon="inline-start" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <ClaimInstructions
        value={value}
        className="max-h-[55vh] overflow-y-auto px-4 py-3.5 text-foreground/90 [&_li]:mt-1.5 [&_li]:pl-1 [&_ol]:marker:text-muted-foreground [&_ul]:marker:text-muted-foreground"
      />
    </div>
  );
}
