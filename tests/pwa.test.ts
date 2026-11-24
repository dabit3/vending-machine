import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, test, vi } from "vitest";
import manifest from "../app/manifest";

const workerSource = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

function worker() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const offline = new Response("Public offline page");
  const cache = { add: vi.fn().mockResolvedValue(undefined), match: vi.fn().mockResolvedValue(offline) };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi.fn().mockResolvedValue(["trydevin-offline-v0", "trydevin-offline-v1", "unrelated-app"]),
    delete: vi.fn().mockResolvedValue(true),
  };
  const fetch = vi.fn().mockResolvedValue(new Response("Live account page"));
  const self = {
    location: { origin: "https://trydevin.ai" },
    addEventListener: (name: string, handler: (event: unknown) => void) => { handlers[name] = handler; },
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    clients: { claim: vi.fn().mockResolvedValue(undefined) },
  };
  runInNewContext(workerSource, {
    self, caches, fetch, URL, Response, setTimeout, clearTimeout, AbortController,
    Request: class { constructor(public url: string, public options: unknown) {} },
  });
  const request = { url: "https://trydevin.ai/my-codes", method: "GET", mode: "navigate" };
  const navigate = (overrides = {}) => {
    const respondWith = vi.fn();
    handlers.fetch({ request: { ...request, ...overrides }, respondWith });
    return respondWith;
  };
  return { handlers, offline, cache, caches, fetch, self, navigate };
}

test("the app installs at a stable identity with standalone navigation and real icons", () => {
  const app = manifest();
  expect(app).toMatchObject({ id: "/", name: "Try Devin", short_name: "Try Devin", start_url: "/", scope: "/", display: "standalone" });
  expect(app.shortcuts).toContainEqual(expect.objectContaining({ url: "/my-codes" }));
  for (const icon of app.icons!) {
    const png = readFileSync(new URL(`../public${icon.src}`, import.meta.url));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
  }
  expect(app.icons).toContainEqual(expect.objectContaining({ purpose: "maskable" }));
});

describe("the privacy-preserving offline worker", () => {
  test("installs only the static public viewer and its dependency-free scripts", async () => {
    const { handlers, cache, self } = worker();
    const waitUntil = vi.fn();
    handlers.install({ waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(cache.add.mock.calls.map(([request]) => request.url)).toEqual([
      "/offline.html", "/offline-viewer.js", "/offline-store.js",
    ]);
    expect(self.skipWaiting).toHaveBeenCalledOnce();
  });

  test("removes only its own obsolete caches and takes over open tabs", async () => {
    const { handlers, caches, self } = worker();
    const waitUntil = vi.fn();
    handlers.activate({ waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(caches.delete.mock.calls.map(([name]) => name)).toEqual(["trydevin-offline-v0", "trydevin-offline-v1"]);
    expect(self.clients.claim).toHaveBeenCalledOnce();
  });

  test("always fetches live private pages without writing them to a cache", async () => {
    const { navigate, caches, fetch } = worker();
    const response = await navigate().mock.calls[0][0];
    expect(await response.text()).toBe("Live account page");
    expect(fetch).toHaveBeenCalledOnce();
    expect(caches.open).not.toHaveBeenCalled();
  });

  test("returns only the public fallback when a navigation fails", async () => {
    const { navigate, fetch, cache, offline } = worker();
    fetch.mockRejectedValue(new TypeError("Network unavailable"));
    expect(await navigate().mock.calls[0][0]).toBe(offline);
    expect(cache.match).toHaveBeenCalledExactlyOnceWith("/offline.html");
    expect(cache.add).not.toHaveBeenCalled();
  });

  test.each(["/my-codes", "/conference"])("a stalled Wi-Fi navigation to %s falls back after five seconds", async (path) => {
    vi.useFakeTimers();
    try {
      const { navigate, fetch, offline } = worker();
      fetch.mockImplementation(() => new Promise(() => {}));
      const response = navigate({ url: `https://trydevin.ai${path}` }).mock.calls[0][0];
      await vi.advanceTimersByTimeAsync(5000);
      expect(await response).toBe(offline);
    } finally { vi.useRealTimers(); }
  });

  test("receiving headers does not disable the deadline for a stalled HTML body", async () => {
    vi.useFakeTimers();
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    try {
      const { navigate, fetch, offline } = worker();
      const body = new ReadableStream<Uint8Array>({ start(controller) {
        stream = controller;
        controller.enqueue(new TextEncoder().encode("<!doctype html><html>"));
      } });
      fetch.mockResolvedValue(new Response(body, { headers: { "Content-Type": "text/html" } }));
      const response = navigate().mock.calls[0][0];
      await vi.advanceTimersByTimeAsync(5000);
      expect(await response).toBe(offline);
      expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    } finally { stream.close(); vi.useRealTimers(); }
  });

  test("complete HTML keeps the original response and its redirect metadata", async () => {
    const { navigate, fetch } = worker();
    const live = new Response("<html>Account</html>", { headers: { "Content-Type": "text/html" } });
    fetch.mockResolvedValue(live);
    expect(await navigate().mock.calls[0][0]).toBe(live);
    expect(await live.text()).toContain("Account");
  });

  test("dynamic event pages keep streaming even while a slow metadata tail stays open", async () => {
    vi.useFakeTimers();
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    try {
      const { navigate, fetch } = worker();
      const body = new ReadableStream<Uint8Array>({ start(controller) {
        stream = controller;
        controller.enqueue(new TextEncoder().encode("<html><main>Claim credits</main>"));
      } });
      const live = new Response(body, { headers: { "Content-Type": "text/html" } });
      fetch.mockResolvedValue(live);
      expect(await navigate({ url: "https://trydevin.ai/conference" }).mock.calls[0][0]).toBe(live);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(6000);
      expect(live.bodyUsed).toBe(false);
    } finally { stream.close(); vi.useRealTimers(); }
  });

  test.each(["/offline.html", "/offline-viewer.js", "/offline-store.js"])("can cold-load public viewer asset %s offline", async (path) => {
    const { navigate, cache, fetch, offline } = worker();
    expect(await navigate({ url: `https://trydevin.ai${path}`, mode: "cors" }).mock.calls[0][0]).toBe(offline);
    expect(cache.match).toHaveBeenCalledWith(path);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("still explains a failed connection if the offline cache was evicted", async () => {
    const { navigate, fetch, cache } = worker();
    fetch.mockRejectedValue(new TypeError("Network unavailable"));
    cache.match.mockResolvedValue(undefined);
    const response = await navigate().mock.calls[0][0];
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("Reconnect");
  });

  test.each([
    { mode: "cors", url: "https://trydevin.ai/admin?_rsc=private" },
    { method: "POST" },
    { url: "https://clerk.example.com/sign-in" },
    { url: "https://example.convex.cloud/api/query", mode: "cors" },
  ])("does not intercept mutations, RSC, or third-party auth/backend requests: %j", (request) => {
    const { navigate, fetch, caches } = worker();
    expect(navigate(request)).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(caches.open).not.toHaveBeenCalled();
  });

  test("does not mask HTTP auth errors with an offline screen", async () => {
    const { navigate, fetch } = worker();
    const forbidden = new Response("Forbidden", { status: 403 });
    fetch.mockResolvedValue(forbidden);
    expect(await navigate().mock.calls[0][0]).toBe(forbidden);
  });
});
