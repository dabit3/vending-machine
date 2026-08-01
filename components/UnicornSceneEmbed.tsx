"use client";

import { useEffect, useRef } from "react";

// Minimal Unicorn Studio embed host, replacing the unicornstudio-react
// wrapper. The wrapper's async addScene can't be cancelled, so React 19
// StrictMode double-effects and rapid remounts (theme toggle, HMR) overlap
// create/destroy cycles on one element and the SDK's global render loop
// trips over half-torn-down scenes ("Cannot read properties of null
// (reading 'canvas')", "... of undefined (reading 'filter')"). This host
// defers init by a tick — StrictMode's immediate mount→cleanup→mount clears
// the timer before it fires — so only the surviving mount initializes, and
// a destroy always completes before the next init can begin.

interface UnicornSceneInstance {
  destroy: () => void;
  resize?: () => void;
}

interface UnicornStudioSdk {
  addScene: (config: {
    elementId: string;
    projectId: string;
    production: boolean;
    scale: number;
    dpi: number;
    fps: number;
    lazyLoad: boolean;
  }) => Promise<UnicornSceneInstance>;
}

function getSdk(): UnicornStudioSdk | undefined {
  return (window as { UnicornStudio?: UnicornStudioSdk }).UnicornStudio;
}

// Same pinned SDK build the official embed snippet uses; loaded once and
// shared by every host on the page.
const SDK_URL =
  "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.2.8/dist/unicornStudio.umd.js";

let sdkPromise: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (getSdk()?.addScene) return Promise.resolve();
  sdkPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      sdkPromise = null;
      script.remove();
      reject(new Error("Failed to load the Unicorn Studio SDK"));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

let hostCounter = 0;

export default function UnicornSceneEmbed({
  projectId,
  production = false,
  scale = 1,
  dpi = 1.5,
  fps = 60,
}: {
  /** Unicorn Studio project ID; may carry a query, e.g. "abc?update=2". */
  projectId: string;
  /** Read the CDN-cached publish instead of fresh (cache-busted) data. */
  production?: boolean;
  scale?: number;
  dpi?: number;
  fps?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let scene: UnicornSceneInstance | null = null;
    let observer: ResizeObserver | null = null;

    const timer = window.setTimeout(async () => {
      try {
        await loadSdk();
        if (cancelled) return;
        if (!host.id) host.id = `unicorn-embed-${++hostCounter}`;
        const created = await getSdk()!.addScene({
          elementId: host.id,
          projectId,
          production,
          scale,
          dpi,
          fps,
          lazyLoad: false,
        });
        if (cancelled) {
          created.destroy();
          return;
        }
        scene = created;
        observer = new ResizeObserver(() => scene?.resize?.());
        observer.observe(host);
      } catch (error) {
        if (!cancelled) {
          console.error("Unicorn Studio scene failed to load:", error);
        }
      }
    }, 25);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      observer?.disconnect();
      scene?.destroy();
      scene = null;
    };
  }, [projectId, production, scale, dpi, fps]);

  return <div ref={hostRef} style={{ width: "100%", height: "100%" }} />;
}
