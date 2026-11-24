// Shared by the bundled app and the dependency-free offline document. Only
// explicitly projected, already-claimed codes belong here, never auth tokens.
export const WALLET_KEY = "trydevin-claimed-codes-v1";
export const OWNER_KEY = "trydevin-offline-owner-v1";
export const DISABLED_KEY = "trydevin-offline-disabled-v1";
export const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function clearWallet(storage) {
  try { storage.removeItem(WALLET_KEY); } catch { /* Storage may be blocked. */ }
}

export function activateOwner(storage, owner) {
  try {
    if (storage.getItem(OWNER_KEY) !== owner) clearWallet(storage);
    if (owner) storage.setItem(OWNER_KEY, owner);
    else storage.removeItem(OWNER_KEY);
  } catch { clearWallet(storage); }
}

export function setOfflineEnabled(storage, enabled) {
  try {
    // Disable first so an in-flight request cannot restore a removed copy.
    if (enabled) storage.removeItem(DISABLED_KEY);
    else { storage.setItem(DISABLED_KEY, "true"); clearWallet(storage); }
    return true;
  } catch { clearWallet(storage); return false; }
}

export function offlineEnabled(storage) {
  try { return storage.getItem(DISABLED_KEY) !== "true"; } catch { return false; }
}

function cleanCode(item) {
  if (!item || typeof item.code !== "string" || !item.code ||
      typeof item.eventName !== "string" || typeof item.value !== "string" ||
      (item.codeType !== undefined && typeof item.codeType !== "string") ||
      (item.detail !== undefined && typeof item.detail !== "string") ||
      (item.expiresAt !== undefined && !Number.isFinite(item.expiresAt))) return null;
  return {
    code: item.code, eventName: item.eventName, value: item.value,
    ...(item.codeType ? { codeType: item.codeType } : {}),
    ...(item.detail ? { detail: item.detail } : {}),
    ...(item.expiresAt !== undefined ? { expiresAt: item.expiresAt } : {}),
  };
}

export function readWallet(storage, now = Date.now()) {
  try {
    const raw = storage.getItem(WALLET_KEY);
    if (!raw) return null;
    const wallet = JSON.parse(raw);
    if (wallet.version !== 1 || typeof wallet.owner !== "string" ||
        wallet.owner !== storage.getItem(OWNER_KEY) || !offlineEnabled(storage) ||
        !Number.isFinite(wallet.savedAt) || wallet.savedAt > now ||
        now - wallet.savedAt >= MAX_AGE || !Array.isArray(wallet.codes)) {
      clearWallet(storage); return null;
    }
    const cleaned = wallet.codes.map(cleanCode);
    if (cleaned.some((code) => !code)) { clearWallet(storage); return null; }
    const codes = cleaned.filter((code) => code.expiresAt === undefined || code.expiresAt > now);
    if (codes.length === 0) { clearWallet(storage); return null; }
    const result = { version: 1, owner: wallet.owner, savedAt: wallet.savedAt, codes };
    if (codes.length !== wallet.codes.length) storage.setItem(WALLET_KEY, JSON.stringify(result));
    return result;
  } catch { clearWallet(storage); return null; }
}

export function saveWallet(storage, owner, items, now = Date.now()) {
  try {
    // A different tab, sign-out, or Remove may have invalidated this fetch.
    if (!owner || storage.getItem(OWNER_KEY) !== owner || !offlineEnabled(storage)) return false;
    const codes = items.map(cleanCode).filter((code) => code &&
      (code.expiresAt === undefined || code.expiresAt > now));
    if (codes.length === 0) { clearWallet(storage); return true; }
    storage.setItem(WALLET_KEY, JSON.stringify({ version: 1, owner, savedAt: now, codes }));
    return true;
  } catch { return false; }
}
