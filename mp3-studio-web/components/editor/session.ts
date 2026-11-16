/**
 * Session auto-save: the cut regions of a file, kept in localStorage so re-opening the same
 * file restores them. Pure helpers (no React, no DOM globals) — the storage is passed in, so
 * this is unit-tested in Node with a fake (session.test.ts). Used by hooks/useSessionAutosave.ts.
 *
 *   key    mp3studio-web:session:<hash of name|size|lastModified>
 *   value  { v: 1, cuts: [{ start, end }, …], savedAt: <ms since epoch> }
 *
 * Only the MAX_SESSIONS most recently saved files are kept. Every storage call is wrapped in
 * try/catch: localStorage can be missing, throw on access (private mode, blocked site data) or
 * be full (quota). A failure only means the cuts aren't remembered — it never breaks editing.
 */

export const SESSION_PREFIX = "mp3studio-web:session:";
export const MAX_SESSIONS = 20;

/** The subset of the Web Storage API used here (window.localStorage satisfies it). */
export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StoredCut { start: number; end: number }

interface StoredSession { v: 1; cuts: StoredCut[]; savedAt: number }

/** 32-bit FNV-1a hash as 8 hex chars. Not cryptographic — just a short, stable key. */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Storage key for a file. Same name + size + lastModified → same key. */
export function sessionKey(file: { name: string; size: number; lastModified: number }): string {
  return SESSION_PREFIX + hashString(`${file.name}|${file.size}|${file.lastModified}`);
}

/** Keeps only well-formed cuts, clamped to [0, duration] (when given), sorted by start. */
export function sanitizeCuts(raw: unknown, duration?: number): StoredCut[] {
  if (!Array.isArray(raw)) return [];
  const max = duration !== undefined && duration > 0 ? duration : Infinity;
  const cuts: StoredCut[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const { start, end } = c as Record<string, unknown>;
    if (typeof start !== "number" || typeof end !== "number") continue;
    if (!isFinite(start) || !isFinite(end)) continue;
    const s = Math.max(0, Math.min(start, max));
    const e = Math.max(0, Math.min(end, max));
    if (e > s) cuts.push({ start: s, end: e });
  }
  return cuts.sort((a, b) => a.start - b.start);
}

/** Reads the saved cuts for `key`, or null if there are none (or storage is unusable). */
export function loadSession(storage: StorageLike | null, key: string, duration?: number): StoredCut[] | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession> | null;
    const cuts = sanitizeCuts(parsed?.cuts, duration);
    return cuts.length > 0 ? cuts : null;
  } catch {
    return null;
  }
}

/** Removes the oldest saved sessions so at most `max` remain. */
export function pruneSessions(storage: StorageLike, max = MAX_SESSIONS): void {
  try {
    const entries: { key: string; savedAt: number }[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !key.startsWith(SESSION_PREFIX)) continue;
      let savedAt = 0;
      try {
        const v = JSON.parse(storage.getItem(key) ?? "null") as Partial<StoredSession> | null;
        if (typeof v?.savedAt === "number") savedAt = v.savedAt;
      } catch { /* unreadable entry → treated as oldest */ }
      entries.push({ key, savedAt });
    }
    entries.sort((a, b) => b.savedAt - a.savedAt);
    for (const { key } of entries.slice(max)) storage.removeItem(key);
  } catch { /* storage unusable — nothing to prune */ }
}

/**
 * Saves `cuts` under `key` (removes the entry when there are no cuts) and prunes old sessions.
 * On a quota error it prunes to half the cap and retries once. Returns true if stored.
 */
export function saveSession(
  storage: StorageLike | null, key: string, cuts: StoredCut[], now = Date.now(),
): boolean {
  if (!storage) return false;
  try {
    if (cuts.length === 0) { storage.removeItem(key); return true; }
    const value = JSON.stringify({
      v: 1, savedAt: now, cuts: cuts.map(({ start, end }) => ({ start, end })),
    } satisfies StoredSession);
    try {
      storage.setItem(key, value);
    } catch {
      pruneSessions(storage, Math.floor(MAX_SESSIONS / 2));
      storage.setItem(key, value);
    }
    pruneSessions(storage);
    return true;
  } catch {
    return false;
  }
}
