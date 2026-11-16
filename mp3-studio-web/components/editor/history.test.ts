import { describe, expect, it } from "vitest";
import {
  canRedo, canUndo, currentMode, histReducer, historyWithMode, initialHistory, toSnapshot,
  type HistAction, type HistState,
} from "./history";
import type { RegionData } from "./types";

const r = (id: string, start: number, end: number): RegionData => ({ id, start, end });
const A = [r("a", 1, 2)];
const AB = [r("a", 1, 2), r("b", 5, 6)];
const ABC = [r("a", 1, 2), r("b", 5, 6), r("c", 8, 9)];

const run = (actions: HistAction[], from: HistState = initialHistory) =>
  actions.reduce(histReducer, from);
const current = (s: HistState) => s.history[s.ptr];

describe("histReducer", () => {
  it("starts with one empty snapshot and nothing to undo or redo", () => {
    expect(initialHistory).toEqual({ history: [[]], ptr: 0, modes: ["cut"] });
    expect(canUndo(initialHistory)).toBe(false);
    expect(canRedo(initialHistory)).toBe(false);
  });

  it("push appends a snapshot and moves the pointer to it", () => {
    const s = run([{ type: "push", snap: A }, { type: "push", snap: AB }]);
    expect(s.history).toEqual([[], A, AB]);
    expect(s.ptr).toBe(2);
    expect(current(s)).toEqual(AB);
    expect(canUndo(s)).toBe(true);
    expect(canRedo(s)).toBe(false);
  });

  it("undo and redo move the pointer without changing the snapshots", () => {
    const pushed = run([{ type: "push", snap: A }, { type: "push", snap: AB }]);
    const undone = histReducer(pushed, { type: "undo" });
    expect(undone.ptr).toBe(1);
    expect(current(undone)).toEqual(A);
    expect(undone.history).toBe(pushed.history);
    expect(canRedo(undone)).toBe(true);

    const redone = histReducer(undone, { type: "redo" });
    expect(redone.ptr).toBe(2);
    expect(current(redone)).toEqual(AB);
  });

  it("undo at the start is a no-op and returns the same state object", () => {
    expect(histReducer(initialHistory, { type: "undo" })).toBe(initialHistory);
    const s = run([{ type: "push", snap: A }, { type: "undo" }]);
    expect(histReducer(s, { type: "undo" })).toBe(s);
  });

  it("redo at the end is a no-op and returns the same state object", () => {
    expect(histReducer(initialHistory, { type: "redo" })).toBe(initialHistory);
    const s = run([{ type: "push", snap: A }]);
    expect(histReducer(s, { type: "redo" })).toBe(s);
  });

  it("push after undo drops the redo branch", () => {
    const s = run([
      { type: "push", snap: A },
      { type: "push", snap: AB },
      { type: "undo" },
      { type: "undo" },
      { type: "push", snap: ABC },
    ]);
    expect(s.history).toEqual([[], ABC]);
    expect(s.ptr).toBe(1);
    expect(canRedo(s)).toBe(false);
  });

  it("reset records an empty snapshot that can be undone", () => {
    const s = run([{ type: "push", snap: AB }, { type: "reset" }]);
    expect(s.history).toEqual([[], AB, []]);
    expect(current(s)).toEqual([]);
    expect(current(histReducer(s, { type: "undo" }))).toEqual(AB);
  });

  it("reset after undo also drops the redo branch", () => {
    const s = run([{ type: "push", snap: A }, { type: "push", snap: AB }, { type: "undo" }, { type: "reset" }]);
    expect(s.history).toEqual([[], A, []]);
    expect(s.ptr).toBe(2);
  });

  it("reset with no cuts still records a step (current behavior)", () => {
    const s = histReducer(initialHistory, { type: "reset" });
    expect(s.history).toEqual([[], []]);
    expect(canUndo(s)).toBe(true);
  });

  it("clear forgets all history", () => {
    const s = run([{ type: "push", snap: A }, { type: "push", snap: AB }, { type: "undo" }, { type: "clear" }]);
    expect(s).toEqual({ history: [[]], ptr: 0, modes: ["cut"] });
    expect(canUndo(s)).toBe(false);
    expect(canRedo(s)).toBe(false);
  });

  it("load makes a snapshot the new baseline (restored session: nothing to undo)", () => {
    const s = run([{ type: "push", snap: A }, { type: "load", snap: AB }]);
    expect(s).toEqual({ history: [AB], ptr: 0, modes: ["cut"] });
    expect(canUndo(s)).toBe(false);
    expect(canRedo(s)).toBe(false);
    // Clearing the restored cuts afterwards is undoable and brings them back.
    const cleared = histReducer(s, { type: "reset" });
    expect(current(histReducer(cleared, { type: "undo" }))).toEqual(AB);
  });

  it("never mutates the previous state", () => {
    const before = run([{ type: "push", snap: A }, { type: "push", snap: AB }, { type: "undo" }]);
    const frozen = structuredClone(before);
    run([{ type: "push", snap: ABC }, { type: "reset" }, { type: "undo" }, { type: "clear" }], before);
    expect(before).toEqual(frozen);
  });

  it("many undos then redos walk back and forth through every snapshot", () => {
    const snaps = [A, AB, ABC];
    let s = run(snaps.map((snap) => ({ type: "push", snap }) as HistAction));
    for (let i = snaps.length - 1; i >= 0; i--) s = histReducer(s, { type: "undo" });
    expect(s.ptr).toBe(0);
    expect(histReducer(s, { type: "undo" })).toBe(s);
    for (const snap of snaps) {
      s = histReducer(s, { type: "redo" });
      expect(current(s)).toEqual(snap);
    }
    expect(histReducer(s, { type: "redo" })).toBe(s);
  });
});

describe("toSnapshot", () => {
  it("keeps only id, start and end", () => {
    const withExtra = [{ id: "a", start: 1, end: 2, wsRef: { remove() {} } }] as unknown as RegionData[];
    expect(toSnapshot(withExtra)).toEqual([{ id: "a", start: 1, end: 2 }]);
  });
});

describe("region mode (keep mode) in history", () => {
  it("starts in the given mode and push keeps the current mode by default", () => {
    expect(currentMode(initialHistory)).toBe("cut");
    const s = run([{ type: "push", snap: A }], historyWithMode("keep"));
    expect(currentMode(s)).toBe("keep");
    expect(s.modes).toEqual(["keep", "keep"]);
  });

  it("undoing a push that switched the mode switches it back; redo switches again", () => {
    const s = run([{ type: "push", snap: A }, { type: "push", snap: AB, mode: "keep" }]);
    expect(currentMode(s)).toBe("keep");
    const undone = histReducer(s, { type: "undo" });
    expect(currentMode(undone)).toBe("cut");
    expect(current(undone)).toEqual(A);
    expect(currentMode(histReducer(undone, { type: "redo" }))).toBe("keep");
  });

  it("setMode changes only the current entry, without a new history step", () => {
    const s = run([{ type: "push", snap: A }, { type: "reset" }, { type: "setMode", mode: "keep" }]);
    expect(s.history).toEqual([[], A, []]);
    expect(s.modes).toEqual(["cut", "cut", "keep"]);
    expect(currentMode(histReducer(s, { type: "undo" }))).toBe("cut");
    expect(histReducer(s, { type: "setMode", mode: "keep" })).toBe(s);
  });

  it("a new push drops the redo branch's modes too; reset and load keep or set the mode", () => {
    let s = run([{ type: "push", snap: A, mode: "keep" }, { type: "undo" }, { type: "push", snap: AB }]);
    expect(s.modes).toEqual(["cut", "cut"]);
    s = histReducer(historyWithMode("keep"), { type: "reset" });
    expect(s.modes).toEqual(["keep", "keep"]);
    expect(histReducer(initialHistory, { type: "load", snap: A, mode: "keep" }).modes).toEqual(["keep"]);
    expect(histReducer(historyWithMode("keep"), { type: "load", snap: A }).modes).toEqual(["keep"]);
  });
});
