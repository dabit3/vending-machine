"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth, useClerk } from "@clerk/nextjs";
import { useConvexConnectionState, useConvexAuth, useQuery } from "convex/react";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { codeValueSummary } from "@/lib/block-value";
import { Button } from "@/components/ui/button";
import {
  activateOwner, clearWallet, offlineEnabled, OWNER_KEY, readWallet, saveWallet, setOfflineEnabled,
} from "@/public/offline-store.js";

const CHANGE = "trydevin-offline-codes-change";
function notify() { window.dispatchEvent(new Event(CHANGE)); }
function subscribe(callback: () => void) {
  window.addEventListener(CHANGE, callback);
  window.addEventListener("storage", callback);
  window.addEventListener("online", callback);
  return () => {
    window.removeEventListener(CHANGE, callback);
    window.removeEventListener("storage", callback);
    window.removeEventListener("online", callback);
  };
}
function enabledSnapshot() {
  try { return offlineEnabled(localStorage); } catch { return false; }
}

// Keep this mounted across routes, including the successful claim receipt.
export function OfflineCodesSync() {
  const { isLoaded, isSignedIn, userId, sessionId, sessionClaims, getToken } = useAuth();
  const clerk = useClerk();
  const { isAuthenticated } = useConvexAuth();
  const { isWebSocketConnected } = useConvexConnectionState();
  const enabled = useSyncExternalStore(subscribe, enabledSnapshot, () => false);
  const codes = useQuery(api.codes.mine, isLoaded && isSignedIn && isAuthenticated && enabled ? {} : "skip");

  useEffect(() => {
    if (!isLoaded) return;
    try {
      activateOwner(localStorage, isSignedIn ? userId : null);
      readWallet(localStorage); // Expire old snapshots even outside My codes.
      notify();
    } catch { /* Private browsing can make storage unavailable. */ }
  }, [isLoaded, isSignedIn, userId, sessionId]);

  useEffect(() => {
    if (!isLoaded) return;
    // Clerk notifies listeners before its sign-out redirect can unload React.
    return clerk.addListener(({ user }) => {
      try { activateOwner(localStorage, user?.id ?? null); notify(); } catch { /* Storage unavailable. */ }
    });
  }, [clerk, isLoaded]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId || !isAuthenticated || !isWebSocketConnected || !enabled || codes === undefined) return;
    let cancelled = false;
    const owner = userId;
    async function refresh() {
      try {
        // Re-fetch using an explicit, owner-checked token. A reactive query can
        // briefly retain the previous session's value while accounts switch;
        // never label that value with the next user's ID or extend its TTL.
        const token = await getToken(sessionClaims?.aud === "convex" ? {} : { template: "convex" });
        if (!token || cancelled) return;
        const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        if (payload.sub !== owner) return;
        const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
        client.setAuth(token);
        const fresh = await client.query(api.codes.mine, {});
        if (cancelled) return;
        if (fresh === null && localStorage.getItem(OWNER_KEY) === owner) clearWallet(localStorage);
        else if (fresh === null) return;
        else saveWallet(localStorage, owner, fresh.map((item) => {
          const value = item.event?.creditAmount
            ? codeValueSummary(item.event.creditAmount, item.terms) : { headline: "" };
          return {
            code: item.code, codeType: item.codeType, expiresAt: item.expiresAt,
            eventName: item.event?.name ?? "Event removed", value: value.headline, detail: value.detail,
          };
        }));
        notify();
      } catch { /* A failed network request must not extend the saved lifetime. */ }
    }
    void refresh();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, userId, sessionId, isAuthenticated, isWebSocketConnected, enabled, codes, getToken, sessionClaims?.aud]);
  return null;
}

export function OfflineCodesControls() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const enabled = useSyncExternalStore(subscribe, enabledSnapshot, () => false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const update = () => {
      try { setSaved(readWallet(localStorage)?.owner === userId); } catch { setSaved(false); }
    };
    update();
    return subscribe(update);
  }, [userId]);
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      {isLoaded && isSignedIn && <p>{saved ? "Claimed codes saved on this device for up to 7 days. Anyone using this browser can read them." : enabled ? "Offline copies are available after a successful sync." : "Offline saving is off for this browser."}</p>}
      {/* A plain server-rendered link still works if Clerk or hydration stalls. */}
      <Button variant="link" className="h-auto p-0" nativeButton={false} render={<a href="/offline.html" />}>Open offline copies</Button>
      {isLoaded && isSignedIn && <Button variant="link" className="h-auto p-0" onClick={() => {
        try { setOfflineEnabled(localStorage, !enabled); notify(); } catch { /* Storage unavailable. */ }
      }}>{enabled ? "Remove offline copies" : "Save codes on this device"}</Button>}
    </div>
  );
}
