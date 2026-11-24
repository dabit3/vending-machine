import { beforeEach, expect, test } from "vitest";
import {
  activateOwner, DISABLED_KEY, MAX_AGE, OWNER_KEY, WALLET_KEY,
  offlineEnabled, readWallet, saveWallet, setOfflineEnabled,
} from "../public/offline-store.js";

const now = 1_800_000_000_000;
const code = { code: "CLAIMED-123", eventName: "Conference", value: "$200 in credits" };
const entries = new Map<string, string>();
const storage = {
  getItem: (key: string) => entries.get(key) ?? null,
  setItem: (key: string, value: string) => { entries.set(key, value); },
  removeItem: (key: string) => { entries.delete(key); },
};
beforeEach(() => { entries.clear(); activateOwner(storage, "alice"); });

test("stores only the projected claimed-code fields, owner and last successful sync", () => {
  saveWallet(storage, "alice", [{ ...code, email: "private@example.com", token: "do-not-save", event: { private: true } } as typeof code], now);
  expect(JSON.parse(storage.getItem(WALLET_KEY)!)).toEqual({
    version: 1, owner: "alice", savedAt: now, codes: [code],
  });
  expect(readWallet(storage, now + 1)?.codes).toEqual([code]);
});

test("sign-out clears both the snapshot and owner metadata", () => {
  saveWallet(storage, "alice", [code], now);
  activateOwner(storage, null);
  expect(storage.getItem(WALLET_KEY)).toBeNull();
  expect(storage.getItem(OWNER_KEY)).toBeNull();
  expect(saveWallet(storage, "alice", [code], now)).toBe(false);
});

test("switching accounts clears immediately and rejects late writes from another tab or request", () => {
  saveWallet(storage, "alice", [code], now);
  activateOwner(storage, "bob");
  expect(readWallet(storage, now)).toBeNull();
  expect(saveWallet(storage, "alice", [code], now)).toBe(false);
  expect(saveWallet(storage, "bob", [{ ...code, code: "BOBS-CODE" }], now)).toBe(true);
  expect(readWallet(storage, now)?.codes[0].code).toBe("BOBS-CODE");
});

test("Remove deletes copies and prevents background sync restoring them until explicitly enabled", () => {
  saveWallet(storage, "alice", [code], now);
  setOfflineEnabled(storage, false);
  expect(readWallet(storage, now)).toBeNull();
  expect(offlineEnabled(storage)).toBe(false);
  expect(storage.getItem(DISABLED_KEY)).toBe("true");
  expect(saveWallet(storage, "alice", [code], now + 1)).toBe(false);
  activateOwner(storage, "bob");
  expect(offlineEnabled(storage)).toBe(false);
  setOfflineEnabled(storage, true);
  expect(saveWallet(storage, "bob", [code], now + 2)).toBe(true);
});

test("reading never extends the seven-day lifetime and an expired snapshot is removed", () => {
  saveWallet(storage, "alice", [code], now);
  expect(readWallet(storage, now + MAX_AGE - 1)?.savedAt).toBe(now);
  expect(readWallet(storage, now + MAX_AGE)).toBeNull();
  expect(storage.getItem(WALLET_KEY)).toBeNull();
});

test("expired codes are removed while valid codes keep the original sync time", () => {
  saveWallet(storage, "alice", [{ ...code, expiresAt: now + 100 }, { ...code, code: "LATER", expiresAt: now + 200 }], now);
  expect(readWallet(storage, now + 100)).toMatchObject({ savedAt: now, codes: [{ code: "LATER" }] });
  expect(JSON.parse(storage.getItem(WALLET_KEY)!).codes).toHaveLength(1);
  expect(readWallet(storage, now + 200)).toBeNull();
});

test("authoritative empty results remove codes no longer owned by the user", () => {
  saveWallet(storage, "alice", [code], now);
  saveWallet(storage, "alice", [], now + 1);
  expect(storage.getItem(WALLET_KEY)).toBeNull();
});

test.each(["not json", "null", '{"version":2}', JSON.stringify({ version: 1, owner: "bob", savedAt: now, codes: [code] }), JSON.stringify({ version: 1, owner: "alice", savedAt: now + 1, codes: [code] }), JSON.stringify({ version: 1, owner: "alice", savedAt: now, codes: [{ code: 42 }] })])("corrupt, mismatched or unsupported data fails closed: %s", (raw) => {
  storage.setItem(WALLET_KEY, raw);
  expect(readWallet(storage, now)).toBeNull();
  expect(storage.getItem(WALLET_KEY)).toBeNull();
});

test("blocked storage does not break the app", () => {
  const blocked = {
    getItem: () => { throw new Error("Blocked"); },
    setItem: () => { throw new Error("Blocked"); },
    removeItem: () => { throw new Error("Blocked"); },
  };
  expect(() => activateOwner(blocked, null)).not.toThrow();
  expect(readWallet(blocked, now)).toBeNull();
  expect(saveWallet(blocked, "alice", [code], now)).toBe(false);
  expect(setOfflineEnabled(blocked, false)).toBe(false);
});
