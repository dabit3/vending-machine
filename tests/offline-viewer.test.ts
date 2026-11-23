import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test, vi } from "vitest";
import { activateOwner, readWallet, saveWallet, setOfflineEnabled } from "../public/offline-store.js";

const source = readFileSync(new URL("../public/offline-viewer.js", import.meta.url), "utf8").replace(/^import[^\n]+\n/, "");
class Element {
  textContent = "";
  hidden = false;
  children: Element[] = [];
  listeners: Record<string, () => unknown> = {};
  append(child: Element) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  addEventListener(name: string, handler: () => unknown) { this.listeners[name] = handler; }
}
function viewer(path = "/my-codes") {
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); },
  };
  activateOwner(storage, "alice");
  saveWallet(storage, "alice", [{ code: "CODE-123", eventName: "<img src=x onerror=alert(1)>", value: "$200 in credits" }]);
  const ids = Object.fromEntries(["codes", "heading", "description", "privacy", "saved-at", "remove", "view-codes", "status", "retry"].map((id) => [id, new Element()]));
  const handlers: Record<string, () => void> = {};
  const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
  const location = { pathname: path, reload: vi.fn(), assign: vi.fn() };
  let tick!: () => void;
  runInNewContext(source, {
    readWallet, setOfflineEnabled, localStorage: storage, location, navigator: { clipboard },
    document: { getElementById: (id: string) => ids[id], createElement: () => new Element() },
    window: { addEventListener: (name: string, fn: () => void) => { handlers[name] = fn; } },
    setInterval: (fn: () => void) => { tick = fn; },
  });
  return { ids, handlers, storage, clipboard, location, tick };
}

test("a cold offline document renders codes without Clerk, Convex, Next or a network request", () => {
  const { ids } = viewer();
  expect(ids.heading.textContent).toBe("Your saved codes.");
  const card = ids.codes.children[0];
  expect(card.children.map((node) => node.textContent)).toEqual([
    "<img src=x onerror=alert(1)>", "$200 in credits", "CODE-123", "Copy code",
  ]);
  expect(ids["saved-at"].textContent).toContain("Last synced");
  expect(ids.remove.hidden).toBe(false);
});

test("offline copy works and clipboard rejection gives a manual fallback", async () => {
  const { ids, clipboard } = viewer();
  const button = ids.codes.children[0].children.at(-1)!;
  await button.listeners.click();
  expect(clipboard.writeText).toHaveBeenCalledWith("CODE-123");
  expect(ids.status.textContent).toBe("Code copied.");
  clipboard.writeText.mockRejectedValue(new Error("Blocked"));
  await button.listeners.click();
  expect(ids.status.textContent).toContain("copy it manually");
});

test("Remove clears the displayed and persisted codes and disables automatic saving", () => {
  const { ids, storage } = viewer();
  ids.remove.listeners.click();
  expect(ids.codes.children).toHaveLength(0);
  expect(readWallet(storage)).toBeNull();
  expect(ids.status.textContent).toContain("Offline copies removed");
});

test("another tab's sign-out removes codes from the open viewer", () => {
  const { ids, handlers, storage } = viewer();
  activateOwner(storage, null);
  handlers.storage();
  expect(ids.codes.children).toHaveLength(0);
});

test("expired snapshots disappear while the viewer stays open", () => {
  const { ids, storage, tick } = viewer();
  saveWallet(storage, "alice", [{ code: "OLD", eventName: "Event", value: "" }], Date.now() - 8 * 24 * 60 * 60 * 1000);
  tick();
  expect(ids.codes.children).toHaveLength(0);
  expect(readWallet(storage)).toBeNull();
});

test("offline admin/auth URLs do not unexpectedly display saved codes", () => {
  const { ids } = viewer("/admin/codes");
  expect(ids.codes.children).toHaveLength(0);
  expect(ids["view-codes"].hidden).toBe(false);
});

test("reconnect is explicit, so unreliable online events cannot interrupt a code", () => {
  const { handlers, ids, location } = viewer("/offline.html");
  expect(handlers.online).toBeUndefined();
  ids.retry.listeners.click();
  expect(location.assign).toHaveBeenCalledWith("/my-codes");
});
