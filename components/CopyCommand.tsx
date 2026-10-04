"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { copyText } from "@/lib/clipboard";
import { Button } from "@/components/ui/button";

export default function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!(await copyText(command))) {
      toast.error("Couldn't copy automatically", {
        description: "Select the command and copy it manually.",
      });
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface py-1.5 pr-1.5 pl-3">
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-xs whitespace-nowrap select-all">
        {command}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={copied ? "Copied" : "Copy command"}
        onClick={handleCopy}
        className="shrink-0 text-muted-foreground"
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}
