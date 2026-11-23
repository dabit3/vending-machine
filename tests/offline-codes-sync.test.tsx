import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { OfflineCodesSync } from "../components/OfflineCodes";
import { activateOwner, readWallet, saveWallet, setOfflineEnabled } from "../public/offline-store.js";

type Effect = () => void | (() => void);
const state = vi.hoisted(() => ({
  effects: [] as Effect[],
  auth: { isLoaded: true, isSignedIn: true, userId: "alice", sessionId: "session-a", sessionClaims: { aud: "convex" }, getToken: vi.fn() },
  authenticated: true,
  connected: true,
  cached: [{ code: "OLD-REACTIVE-RESULT" }] as unknown,
  query: vi.fn(),
  setAuth: vi.fn(),
  listener: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useEffect: (effect: Effect) => { state.effects.push(effect); },
  useSyncExternalStore: (_: unknown, snapshot: () => unknown) => snapshot(),
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => state.auth, useClerk: () => ({ addListener: state.listener }) }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: state.authenticated }),
  useConvexConnectionState: () => ({ isWebSocketConnected: state.connected }),
  useQuery: () => state.cached,
}));
vi.mock("convex/browser", () => ({ ConvexHttpClient: class { setAuth = state.setAuth; query = state.query; } }));

const entries = new Map<string, string>();
const storage = {
  getItem: (key: string) => entries.get(key) ?? null,
  setItem: (key: string, value: string) => { entries.set(key, value); },
  removeItem: (key: string) => { entries.delete(key); },
};
const token = (sub: string) => `header.${btoa(JSON.stringify({ sub }))}.signature`;
const item = { code: "FRESH-CLAIM", event: { name: "Conference", creditAmount: "200", privateAdminNote: "not stored" }, claimedAt: 123, email: "private@example.com" };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function mount() {
  state.effects = [];
  renderToStaticMarkup(<OfflineCodesSync />);
  return state.effects.map((effect) => effect());
}
beforeEach(() => {
  entries.clear();
  vi.clearAllMocks();
  Object.assign(state.auth, { isLoaded: true, isSignedIn: true, userId: "alice", sessionId: "session-a" });
  state.authenticated = state.connected = true;
  state.cached = [{ code: "OLD-REACTIVE-RESULT" }];
  state.auth.getToken.mockResolvedValue(token("alice"));
  state.query.mockResolvedValue([item]);
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

test("hydrates from a fresh owner-checked response, never the possibly stale reactive value", async () => {
  mount(); await flush();
  expect(state.setAuth).toHaveBeenCalledWith(token("alice"));
  expect(readWallet(storage)?.codes).toEqual([{ code: "FRESH-CLAIM", eventName: "Conference", value: "$200 in credits" }]);
  expect([...entries.values()].join()).not.toContain("private@example.com");
});

test("a token for a previous account cannot save that account's codes as the new user's", async () => {
  state.auth.getToken.mockResolvedValue(token("bob"));
  mount(); await flush();
  expect(state.query).not.toHaveBeenCalled();
  expect(readWallet(storage)).toBeNull();
});

test("a request resolving after sign-out is cancelled and cannot recreate the wallet", async () => {
  let resolve!: (items: typeof item[]) => void;
  state.query.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const cleanups = mount(); await flush();
  cleanups.forEach((cleanup) => cleanup?.());
  activateOwner(storage, null);
  resolve([item]); await flush();
  expect(readWallet(storage)).toBeNull();
});

test("Clerk's sign-out notification clears storage before redirect, and account switches clear it too", async () => {
  mount(); await flush();
  expect(readWallet(storage)).not.toBeNull();
  state.listener.mock.calls[0][0]({ user: null });
  expect(readWallet(storage)).toBeNull();
  activateOwner(storage, "alice");
  saveWallet(storage, "alice", [{ code: "A", eventName: "A", value: "" }]);
  state.listener.mock.calls[0][0]({ user: { id: "bob" } });
  expect(readWallet(storage)).toBeNull();
});

test("failed sync preserves the old copy without extending its lifetime", async () => {
  activateOwner(storage, "alice");
  const savedAt = Date.now() - 1000;
  saveWallet(storage, "alice", [{ code: "PREVIOUS", eventName: "A", value: "" }], savedAt);
  state.query.mockRejectedValue(new Error("Offline"));
  mount(); await flush();
  expect(readWallet(storage)).toMatchObject({ savedAt, codes: [{ code: "PREVIOUS" }] });
});

test("Remove blocks an already in-flight successful response", async () => {
  let resolve!: (items: typeof item[]) => void;
  state.query.mockImplementation(() => new Promise((done) => { resolve = done; }));
  mount(); await flush();
  setOfflineEnabled(storage, false);
  resolve([item]); await flush();
  expect(readWallet(storage)).toBeNull();
});

test("disconnected sessions do not stamp stale query data with a new sync time", async () => {
  state.connected = false;
  mount(); await flush();
  expect(state.auth.getToken).not.toHaveBeenCalled();
  expect(state.query).not.toHaveBeenCalled();
});

test("unverified or no-longer-authorized live results clear saved codes", async () => {
  activateOwner(storage, "alice");
  saveWallet(storage, "alice", [{ code: "PREVIOUS", eventName: "A", value: "" }]);
  state.query.mockResolvedValue(null);
  mount(); await flush();
  expect(readWallet(storage)).toBeNull();
});
