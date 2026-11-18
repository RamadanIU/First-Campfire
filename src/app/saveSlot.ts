/**
 * The autosave slot: one save in the browser's storage (localStorage) — the world the player
 * comes back to (step 0.7, ADR-016).
 *
 * localStorage is synchronous, so the world can still be saved while the tab is closing. It
 * holds about 5 million characters per site (Chromium: 5 242 880); a world of 200 game years is
 * ≈ 1.7 million characters of save text. The browser may
 * also refuse storage altogether (private mode, blocked site data): then the slot is
 * `available: false` and the game runs without autosave, offering to save to a file.
 *
 * Nothing here throws: every failure becomes a message for the player (src/ui/texts.ts).
 */
import { SAVE_TEXT, storedSize } from '../ui/texts.ts';

/** Key of the autosave in the browser's storage. */
export const AUTOSAVE_KEY = 'first-campfire/autosave';

/** The part of Web Storage the slot uses: localStorage in the browser, a fake in tests. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type WriteResult = { ok: true } | { ok: false; message: string };

export interface SaveSlot {
  /** False when the browser keeps no storage for the game (private mode, blocked site data). */
  readonly available: boolean;
  /** The saved text, or null if there is none (or it cannot be read). */
  read(): string | null;
  /** Put save text into the slot, replacing the previous one. */
  write(text: string): WriteResult;
  /** Remove the save. */
  clear(): void;
}

function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

/** The slot over `storage` (null — no storage: an unavailable slot). */
export function createSaveSlot(storage: KeyValueStorage | null, key = AUTOSAVE_KEY): SaveSlot {
  return {
    available: storage !== null,
    read() {
      if (storage === null) return null;
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    write(text) {
      if (storage === null) return { ok: false, message: SAVE_TEXT.noStorage };
      try {
        storage.setItem(key, text);
        return { ok: true };
      } catch (error) {
        if (isQuotaError(error)) {
          return {
            ok: false,
            message: SAVE_TEXT.storageFull(storedSize(text.length)),
          };
        }
        return {
          ok: false,
          message: SAVE_TEXT.storageRefused(error instanceof Error ? error.message : String(error)),
        };
      }
    },
    clear() {
      try {
        storage?.removeItem(key);
      } catch {
        // Nothing to clear if the browser does not let us in.
      }
    },
  };
}

/** The browser's localStorage, or null if the page may not use it. */
export function browserStorage(): KeyValueStorage | null {
  try {
    const storage = window.localStorage;
    // With site data blocked the property itself or the first use throws. (A full storage
    // still reads fine — writing then reports the quota, so the probe only reads.)
    storage.getItem(AUTOSAVE_KEY);
    return storage;
  } catch {
    return null;
  }
}
