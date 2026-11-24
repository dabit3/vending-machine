export interface OfflineCode {
  code: string;
  eventName: string;
  value: string;
  detail?: string;
  codeType?: string;
  expiresAt?: number;
}
export interface OfflineWallet {
  version: 1;
  owner: string;
  savedAt: number;
  codes: OfflineCode[];
}
type WalletStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const WALLET_KEY: string;
export const OWNER_KEY: string;
export const DISABLED_KEY: string;
export const MAX_AGE: number;
export function clearWallet(storage: WalletStorage): void;
export function activateOwner(storage: WalletStorage, owner: string | null): void;
export function setOfflineEnabled(storage: WalletStorage, enabled: boolean): boolean;
export function offlineEnabled(storage: WalletStorage): boolean;
export function readWallet(storage: WalletStorage, now?: number): OfflineWallet | null;
export function saveWallet(storage: WalletStorage, owner: string, codes: OfflineCode[], now?: number): boolean;
