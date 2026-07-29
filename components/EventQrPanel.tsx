"use client";

import { Undo2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function EventQrPanel({
  eventName,
  url,
  onBack,
  hidden,
}: {
  eventName: string;
  url: string;
  onBack: () => void;
  hidden: boolean;
}) {
  return (
    <Card
      inert={hidden || undefined}
      className="gap-0 rotate-y-180 py-0 backface-hidden [grid-area:1/1] [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]"
    >
      <CardHeader className="gap-2 border-b border-border py-(--card-spacing)">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <span className="eyebrow text-muted-foreground">Scan to claim</span>
            <CardTitle className="font-heading text-2xl font-semibold tracking-[-0.02em] text-balance">
              {eventName}
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="-mt-1 -mr-2 shrink-0 text-muted-foreground"
            onClick={onBack}
            aria-label="Back to claim form"
            title="Back to claim form"
          >
            <Undo2 />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center justify-center gap-5 py-(--card-spacing)">
        <div className="rounded-lg border border-dashed border-border-strong bg-background p-4 text-foreground">
          {url ? (
            <QRCodeSVG
              value={url}
              size={208}
              marginSize={0}
              fgColor="currentColor"
              bgColor="transparent"
              aria-label={`QR code linking to ${url}`}
            />
          ) : (
            <Skeleton className="size-[208px]" />
          )}
        </div>
        <span className="max-w-full truncate font-mono text-xs text-muted-foreground">
          {url ? url.replace(/^https?:\/\//, "") : "\u00A0"}
        </span>
      </CardContent>
    </Card>
  );
}
