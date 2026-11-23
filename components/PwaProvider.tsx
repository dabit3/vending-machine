"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { Download, WifiOff } from "lucide-react";
import { useTheme } from "next-themes";
import { getAppName } from "@/lib/app-name";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const InstallContext = createContext({ available: false, open: () => {} });
export const useAppInstall = () => useContext(InstallContext);

function subscribeToConnection(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function subscribeToDisplayMode(callback: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", callback);
  window.addEventListener("appinstalled", callback);
  return () => {
    media.removeEventListener("change", callback);
    window.removeEventListener("appinstalled", callback);
  };
}

const subscribeToHydration = () => () => {};

export function InstallAppButton() {
  const install = useAppInstall();
  if (!install.available) return null;
  return (
    <Button variant="ghost" size="sm" onClick={install.open}>
      <Download data-icon="inline-start" aria-hidden />
      Install app
    </Button>
  );
}

export default function PwaProvider({ children }: { children: React.ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const standalone = useSyncExternalStore(subscribeToDisplayMode, isStandalone, () => false);
  const online = useSyncExternalStore(subscribeToConnection, () => navigator.onLine, () => true);
  const { resolvedTheme } = useTheme();
  const ios = hydrated && (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
      setOpen(false);
    };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      // No app assets or private data are cached; updates can take over safely.
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((error: unknown) => console.warn("Offline support unavailable", error));
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = resolvedTheme === "light" ? "#fafafa" : "#121212";
  }, [resolvedTheme]);

  async function install() {
    if (!prompt) return;
    setInstalling(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setOpen(false);
    } finally {
      // A native install prompt can only be used once, even when dismissed.
      setPrompt(null);
      setInstalling(false);
    }
  }

  return (
    <InstallContext.Provider value={{
      // Chromium suppresses beforeinstallprompt for already-installed apps.
      // Don't offer manual instructions there just because a tab was reloaded.
      available: hydrated && !standalone && !installed && "serviceWorker" in navigator &&
        (prompt !== null || !("onbeforeinstallprompt" in window)),
      open: () => setOpen(true),
    }}>
      {children}
      {!online && (
        <div className="pwa-connection fixed inset-x-4 z-50 mx-auto max-w-md">
          <Alert role="status">
            <WifiOff aria-hidden />
            <AlertTitle>You&apos;re offline</AlertTitle>
            <AlertDescription>Reconnect to load or claim credits.</AlertDescription>
          </Alert>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install {getAppName()}</DialogTitle>
            <DialogDescription>
              Open {getAppName()} from your home screen, with more room and no browser tabs.
              You&apos;ll still need an internet connection to view or claim credits.
            </DialogDescription>
          </DialogHeader>
          {prompt ? (
            <Button onClick={() => void install().catch(() => {})} disabled={installing}>
              <Download data-icon="inline-start" aria-hidden />
              {installing ? "Installing…" : "Install app"}
            </Button>
          ) : ios ? (
            <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm text-muted-foreground">
              <li>Open this site in Safari.</li>
              <li>Tap the Share button (you may find it in the More menu).</li>
              <li>Choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</li>
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>.
              In Safari on Mac, choose <strong>File → Add to Dock</strong>.
              If the option isn&apos;t available, try Chrome, Edge, or Safari.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </InstallContext.Provider>
  );
}
