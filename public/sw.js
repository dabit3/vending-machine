// Cache only this public viewer and its scripts, never authenticated HTML,
// RSC, API, auth, or Convex traffic. Claimed snapshots live in separate,
// owner-scoped localStorage and are cleared by the app on auth changes.
const CACHE_NAME = "trydevin-offline-v2";
const OFFLINE_URL = "/offline.html";
const PUBLIC_ASSETS = [OFFLINE_URL, "/offline-viewer.js", "/offline-store.js"];
const WALLET_ENTRYPOINTS = ["/", "/my-codes", "/my-codes/"];

async function offlineFallback() {
  const cache = await caches.open(CACHE_NAME);
  return (await cache.match(OFFLINE_URL)) ?? new Response("You're offline. Reconnect and try again.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(PUBLIC_ASSETS.map((url) => cache.add(new Request(url, { cache: "reload" })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("trydevin-offline-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (PUBLIC_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) =>
      (await cache.match(url.pathname)) ?? fetch(request)));
    return;
  }
  if (request.mode !== "navigate") return;
  // Event Wi-Fi may hang instead of rejecting. Do not leave the installed
  // app waiting indefinitely for a network navigation that cannot finish.
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Navigation timed out"));
    }, 5000);
  });
  const navigation = fetch(request, { signal: controller.signal }).then(async (response) => {
    if (WALLET_ENTRYPOINTS.includes(url.pathname) && response.ok && response.headers.get("Content-Type")?.includes("text/html")) {
      // fetch resolves at headers, not at the end of the HTML download. Keep
      // the deadline active until the document is complete. Returning the
      // original response preserves redirect URL and response metadata.
      await response.clone().arrayBuffer();
    }
    // Dynamic event/admin pages may stream a usable screen before slow
    // metadata finishes. Their deadline covers headers only, not page tails.
    return response;
  });
  event.respondWith(Promise.race([navigation, timeout]).catch(offlineFallback).finally(() => clearTimeout(timer)));
});
