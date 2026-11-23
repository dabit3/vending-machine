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
    self, caches, fetch, URL, Response,
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
  test("installs only the static public fallback", async () => {
    const { handlers, cache, self } = worker();
    const waitUntil = vi.fn();
    handlers.install({ waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(cache.add).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ url: "/offline.html" }));
    expect(self.skipWaiting).toHaveBeenCalledOnce();
  });

  test("removes only its own obsolete caches and takes over open tabs", async () => {
    const { handlers, caches, self } = worker();
    const waitUntil = vi.fn();
    handlers.activate({ waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(caches.delete).toHaveBeenCalledExactlyOnceWith("trydevin-offline-v0");
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
