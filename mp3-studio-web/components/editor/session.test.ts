import { describe, expect, it } from "vitest";
import {
  MAX_SESSIONS, SESSION_PREFIX, hashString, loadSession, pruneSessions, sanitizeCuts, saveSession,
  sessionKey, type StorageLike,
} from "./session";

/** In-memory Web Storage stand-in. `quota` = max number of entries before setItem throws. */
class FakeStorage implements StorageLike {
  map = new Map<string, string>();
  constructor(private quota = Infinity) {}
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (!this.map.has(k) && this.map.size >= this.quota) throw new DOMException("full", "QuotaExceededError");
    this.map.set(k, v);
  }
  removeItem(k: string) { this.map.delete(k); }
}

/** Storage whose every method throws (private mode / blocked site data). */
const broken: StorageLike = {
  get length(): number { throw new Error("denied"); },
  key() { throw new Error("denied"); },
  getItem() { throw new Error("denied"); },
  setItem() { throw new Error("denied"); },
  removeItem() { throw new Error("denied"); },
};

const file = { name: "song.mp3", size: 12345, lastModified: 1_700_000_000_000 };
const cuts = [{ start: 1, end: 2 }, { start: 5, end: 7.5 }];

describe("sessionKey", () => {
  it("is stable and prefixed", () => {
    expect(sessionKey(file)).toBe(sessionKey({ ...file }));
    expect(sessionKey(file).startsWith(SESSION_PREFIX)).toBe(true);
    expect(sessionKey(file)).toMatch(/^mp3studio-web:session:[0-9a-f]{8}$/);
  });
  it("changes when name, size or lastModified changes", () => {
    const k = sessionKey(file);
    expect(sessionKey({ ...file, name: "other.mp3" })).not.toBe(k);
    expect(sessionKey({ ...file, size: 12346 })).not.toBe(k);
    expect(sessionKey({ ...file, lastModified: file.lastModified + 1 })).not.toBe(k);
  });
  it("hashString matches known FNV-1a values", () => {
    expect(hashString("")).toBe("811c9dc5");
    expect(hashString("a")).toBe("e40c292c");
  });
});

describe("save / load", () => {
  it("round-trips cuts", () => {
    const s = new FakeStorage();
    const key = sessionKey(file);
    expect(saveSession(s, key, cuts, 1000)).toBe(true);
    expect(loadSession(s, key)).toEqual(cuts);
    expect(JSON.parse(s.getItem(key)!)).toEqual({ v: 1, savedAt: 1000, cuts });
  });
  it("strips extra fields (ids, live WaveSurfer refs)", () => {
    const s = new FakeStorage();
    saveSession(s, "k", [{ start: 1, end: 2, id: "x", wsRef: {} } as never]);
    expect(JSON.parse(s.getItem("k")!).cuts).toEqual([{ start: 1, end: 2 }]);
  });
  it("removes the entry when there are no cuts", () => {
    const s = new FakeStorage();
    saveSession(s, "k", cuts);
    saveSession(s, "k", []);
    expect(s.getItem("k")).toBeNull();
    expect(loadSession(s, "k")).toBeNull();
  });
  it("returns null for missing, corrupt or empty entries", () => {
    const s = new FakeStorage();
    expect(loadSession(s, "missing")).toBeNull();
    s.setItem("bad", "{not json");
    expect(loadSession(s, "bad")).toBeNull();
    s.setItem("null", "null");
    expect(loadSession(s, "null")).toBeNull();
    s.setItem("empty", JSON.stringify({ v: 1, cuts: [], savedAt: 1 }));
    expect(loadSession(s, "empty")).toBeNull();
  });
  it("clamps restored cuts to the file duration and drops invalid ones", () => {
    const s = new FakeStorage();
    s.setItem("k", JSON.stringify({ v: 1, savedAt: 1, cuts: [
      { start: 8, end: 12 }, { start: 11, end: 15 }, { start: 3, end: 1 }, { start: "a", end: 2 }, null,
      { start: -1, end: 2 },
    ] }));
    expect(loadSession(s, "k", 10)).toEqual([{ start: 0, end: 2 }, { start: 8, end: 10 }]);
  });
  it("never throws when storage is missing or throws", () => {
    expect(loadSession(null, "k")).toBeNull();
    expect(saveSession(null, "k", cuts)).toBe(false);
    expect(loadSession(broken, "k")).toBeNull();
    expect(saveSession(broken, "k", cuts)).toBe(false);
    expect(() => pruneSessions(broken)).not.toThrow();
  });
});

describe("pruning", () => {
  it(`keeps only the ${MAX_SESSIONS} most recently saved sessions`, () => {
    const s = new FakeStorage();
    s.setItem("unrelated", "keep me");
    for (let i = 0; i < MAX_SESSIONS + 5; i++) saveSession(s, `${SESSION_PREFIX}${i}`, cuts, 1000 + i);
    const keys = [...s.map.keys()].filter((k) => k.startsWith(SESSION_PREFIX));
    expect(keys).toHaveLength(MAX_SESSIONS);
    for (let i = 0; i < 5; i++) expect(s.getItem(`${SESSION_PREFIX}${i}`)).toBeNull();
    expect(s.getItem(`${SESSION_PREFIX}${MAX_SESSIONS + 4}`)).not.toBeNull();
    expect(s.getItem("unrelated")).toBe("keep me");
  });
  it("re-saving a file refreshes its place", () => {
    const s = new FakeStorage();
    for (let i = 0; i < MAX_SESSIONS; i++) saveSession(s, `${SESSION_PREFIX}${i}`, cuts, 1000 + i);
    saveSession(s, `${SESSION_PREFIX}0`, cuts, 5000);      // touch the oldest
    saveSession(s, `${SESSION_PREFIX}new`, cuts, 6000);    // pushes out #1, not #0
    expect(s.getItem(`${SESSION_PREFIX}0`)).not.toBeNull();
    expect(s.getItem(`${SESSION_PREFIX}1`)).toBeNull();
  });
  it("treats unreadable entries as oldest", () => {
    const s = new FakeStorage();
    s.setItem(`${SESSION_PREFIX}corrupt`, "{");
    for (let i = 0; i < MAX_SESSIONS; i++) saveSession(s, `${SESSION_PREFIX}${i}`, cuts, 1000 + i);
    expect(s.getItem(`${SESSION_PREFIX}corrupt`)).toBeNull();
    expect(s.getItem(`${SESSION_PREFIX}0`)).not.toBeNull();
  });
  it("on a quota error, prunes to half the cap and retries once", () => {
    const s = new FakeStorage(MAX_SESSIONS);
    for (let i = 0; i < MAX_SESSIONS; i++) s.setItem(`${SESSION_PREFIX}${i}`, JSON.stringify({ v: 1, savedAt: i, cuts }));
    expect(saveSession(s, `${SESSION_PREFIX}new`, cuts, 9999)).toBe(true);
    expect(loadSession(s, `${SESSION_PREFIX}new`)).toEqual(cuts);
    expect(s.length).toBe(MAX_SESSIONS / 2 + 1);
  });
  it("gives up (returns false) when storage stays full", () => {
    const s = new FakeStorage(0);
    expect(saveSession(s, "k", cuts)).toBe(false);
  });
});

describe("sanitizeCuts", () => {
  it("sorts by start and ignores non-arrays", () => {
    expect(sanitizeCuts([{ start: 5, end: 6 }, { start: 1, end: 2 }])).toEqual([{ start: 1, end: 2 }, { start: 5, end: 6 }]);
    expect(sanitizeCuts({})).toEqual([]);
    expect(sanitizeCuts([{ start: Infinity, end: 2 }])).toEqual([]);
  });
});
