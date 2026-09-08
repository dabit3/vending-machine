"use client";

import { useRef, useSyncExternalStore } from "react";
import { Download, SearchX } from "lucide-react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

function subscribeNoop() {
  return () => {};
}

// Public, shareable QR page for an event's claim URL — meant to be opened in
// its own window and projected or printed. The PNG download renders from an
// offscreen canvas so the file is black-on-white regardless of theme.
export default function EventQrPage({ slug }: { slug: string }) {
  const event = useQuery(api.events.getBySlug, { slug });
  const origin = useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => ""
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const claimUrl = origin ? `${origin}/${slug}` : "";

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${slug}-qr.png`;
    a.click();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main
        id="main-content"
        className="relative flex flex-1 items-center justify-center px-4 py-10 sm:px-6 sm:py-16"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-dotgrid [mask-image:radial-gradient(ellipse_60%_60%_at_50%_45%,black,transparent)]"
        />
        <div className="relative flex w-full max-w-md flex-col items-center gap-6 text-center">
          {event === null ? (
            <Empty className="w-full border border-dashed border-border-strong py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX />
                </EmptyMedia>
                <EmptyTitle>Event not found</EmptyTitle>
                <EmptyDescription>
                  There is no event at <span className="font-mono">/{slug}</span>.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="flex flex-col items-center gap-2">
                <span className="eyebrow text-muted-foreground">
                  Scan to claim
                </span>
                {event === undefined ? (
                  <Skeleton className="h-9 w-64 max-w-full rounded-md" />
                ) : (
                  <h1 className="font-heading text-3xl font-semibold tracking-[-0.02em] text-balance wrap-anywhere">
                    {event.name}
                  </h1>
                )}
              </div>
              <div className="rounded-xl border border-border bg-background p-5 text-foreground">
                {claimUrl ? (
                  <QRCodeSVG
                    value={claimUrl}
                    size={288}
                    marginSize={0}
                    fgColor="currentColor"
                    bgColor="transparent"
                    className="size-[min(288px,70vw)]"
                    aria-label={`QR code linking to ${claimUrl}`}
                  />
                ) : (
                  <Skeleton className="size-[min(288px,70vw)]" />
                )}
              </div>
              <span className="max-w-full truncate font-mono text-sm text-muted-foreground">
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
              <Button
                variant="outline"
                size="sm"
                onClick={downloadPng}
                disabled={!claimUrl}
                className="print:hidden"
              >
                <Download data-icon="inline-start" />
                Download PNG
              </Button>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
