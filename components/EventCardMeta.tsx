"use client";

import { useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

const subscribeNoop = () => () => {};

// Small right-hand meta for a home-page event card: a scan-to-claim QR code
// (absolute /slug URL, built client-side so the server never sees it) plus a
// live "X / Y codes claimed" progress line. The QR only renders once the
// browser origin is known, keeping the server and client trees identical.
export default function EventCardMeta({
  slug,
  claimed,
  total,
}: {
  slug: string;
  claimed: number;
  total: number;
}) {
  const origin = useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => "",
  );
  const url = origin ? `${origin}/${slug}` : "";
  const pct = total > 0 ? Math.round((claimed / total) * 100) : 0;

  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <div className="rounded-md border border-border bg-background p-1 text-foreground">
        {url ? (
          <QRCodeSVG
            value={url}
            size={44}
            marginSize={0}
            fgColor="currentColor"
            bgColor="transparent"
            aria-label={`QR code linking to ${url}`}
          />
        ) : (
          <Skeleton className="size-11 rounded-sm" />
        )}
      </div>
      <Progress
        value={pct}
        aria-hidden
        className="w-11 gap-0"
        title={`${claimed} / ${total} codes claimed`}
      />
      <span className="text-[11px] leading-tight text-muted-dim tabular-nums">
        {claimed} / {total} codes claimed
      </span>
    </div>
  );
}
