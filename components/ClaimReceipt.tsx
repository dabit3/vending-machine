"use client";

import { Check, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function ClaimReceipt({
  eventName,
  creditAmount,
  code,
  alreadyClaimed,
  copied,
  onCopy,
}: {
  eventName: string;
  creditAmount?: string;
  code: string;
  alreadyClaimed: boolean;
  copied: boolean;
  onCopy: (code: string) => void;
}) {
  return (
    <div className="receipt-edge rounded-t-xl border border-border bg-surface pb-10" role="status">
      <div className="flex flex-col gap-6 p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <span className="eyebrow text-muted-foreground">Code dispensed</span>
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60 motion-reduce:animate-none [animation-duration:2.5s]" />
            <span className="relative inline-flex size-2 rounded-full bg-brand" />
          </span>
        </div>
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">{eventName}</h1>
          {creditAmount ? <p className="mt-1 text-sm text-muted-foreground">{formatCredits(creditAmount)} in credits</p> : null}
        </div>
        {alreadyClaimed ? <Badge variant="secondary" className="self-start">Already claimed — here it is again</Badge> : null}
        <div className="rounded-lg border border-dashed border-border-strong bg-background px-5 py-6 text-center">
          <div className="eyebrow text-muted-dim">Your credit code</div>
          <div className="mt-3 break-all select-all font-mono text-2xl font-medium tracking-[0.08em]">{code}</div>
        </div>
        <Button variant="brand" size="lg" onClick={() => onCopy(code)}>
          {copied ? <><Check data-icon="inline-start" />Copied</> : <><Copy data-icon="inline-start" />Copy code</>}
        </Button>
        <div aria-hidden className="flex flex-col gap-2 pt-2">
          <div className="h-8 w-full bg-[repeating-linear-gradient(90deg,var(--color-border-strong)_0_2px,transparent_2px_5px,var(--color-border-strong)_5px_6px,transparent_6px_11px)]" />
          <div className="flex items-center justify-between">
            <span className="eyebrow text-muted-dim">Keep this somewhere safe</span>
            <span className="font-mono text-[10px] text-muted-dim">NO.{code.slice(-4).toUpperCase().padStart(4, "0")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatCredits(amount: string) {
  const trimmed = amount.trim();
  return /^\d/.test(trimmed) ? `$${trimmed}` : trimmed;
}
