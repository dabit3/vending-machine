"use client";

import { useRef, useSyncExternalStore } from "react";
import { Copy, Download, QrCode } from "lucide-react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { copyText } from "@/lib/clipboard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

function subscribeNoop() {
  return () => {};
}

// Admin-side QR for an event's public claim URL, with copy and a print-ready
// PNG download. The download renders from an offscreen canvas so the file is
// black-on-white regardless of the current theme.
export default function EventQrDialog({
  eventName,
  slug,
}: {
  eventName: string;
  slug: string;
}) {
  const origin = useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => ""
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const claimUrl = origin ? `${origin}/${slug}` : "";

  async function copyLink() {
    if (!claimUrl) return;
    if (await copyText(claimUrl)) toast.success("Claim link copied");
    else toast.error("Couldn't copy the link");
  }

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${slug}-qr.png`;
    a.click();
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label="Event QR code"
            title="Event QR code"
          />
        }
      >
        <QrCode />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">
            Scan to claim
          </DialogTitle>
          <DialogDescription>
            Anyone who scans this lands on the claim page for {eventName}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-lg border border-border bg-background p-4 text-foreground">
            {claimUrl ? (
              <QRCodeSVG
                value={claimUrl}
                size={224}
                marginSize={0}
                fgColor="currentColor"
                bgColor="transparent"
                aria-label={`QR code linking to ${claimUrl}`}
              />
            ) : (
              <Skeleton className="size-[224px]" />
            )}
          </div>
          <span className="max-w-full truncate font-mono text-xs text-muted-foreground">
            {claimUrl ? claimUrl.replace(/^https?:\/\//, "") : "\u00A0"}
          </span>
          {claimUrl ? (
            <QRCodeCanvas
              ref={canvasRef}
              value={claimUrl}
              size={1024}
              marginSize={2}
              fgColor="#000000"
              bgColor="#ffffff"
              className="hidden"
              aria-hidden
            />
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={copyLink} disabled={!claimUrl}>
            <Copy data-icon="inline-start" />
            Copy link
          </Button>
          <Button onClick={downloadPng} disabled={!claimUrl}>
            <Download data-icon="inline-start" />
            Download PNG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
