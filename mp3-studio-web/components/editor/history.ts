/**
 * Undo/redo history of cut regions — a pure reducer (no React imports, unit-tested in
 * history.test.ts). Used through `useReducer` in hooks/useRegionHistory.ts.
 *
 * Why a reducer and not `useState` for the pointer: WaveSurfer event handlers are registered
 * once, inside an effect. A `useState` pointer captured there goes stale (undo once read
 * `history[undefined]`); a reducer always sees the current state.
 *
 * `history[ptr]` is always the current snapshot. `history[0]` is the empty starting state.
 *
 * `modes[i]` is the region mode (cut / keep) of `history[i]`, so undoing a keep-mode switch also
 * switches the mode back. `push` / `load` take an optional mode (default: the current one),
 * `reset` keeps the current mode, and `setMode` changes the current entry's mode in place (used
 * when the mode is switched while there are no regions — nothing to undo then).
 */

import type { Region, RegionData, RegionMode } from "./types";

export interface HistState {
  history: RegionData[][];
  ptr: number;
  /** Parallel to `history`. */
  modes: RegionMode[];
}

export type HistAction =
  | { type: "push"; snap: RegionData[]; mode?: RegionMode } // record a new snapshot, dropping any redo branch
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset" }                    // record an empty snapshot (undoable "clear all cuts")
  | { type: "clear" }                    // forget everything (new file)
  | { type: "load"; snap: RegionData[]; mode?: RegionMode } // start over from `snap` (restored session) — no undo past it
  | { type: "setMode"; mode: RegionMode };                   // change the current entry's mode (no new entry)

export const initialHistory: HistState = { history: [[]], ptr: 0, modes: ["cut"] };

/** Empty history whose starting mode is `mode`. */
export const historyWithMode = (mode: RegionMode): HistState => ({ history: [[]], ptr: 0, modes: [mode] });

/** Mode of the current snapshot. */
export const currentMode = (s: HistState): RegionMode => s.modes[s.ptr] ?? "cut";

export function histReducer(s: HistState, a: HistAction): HistState {
  switch (a.type) {
    case "push": {
      const h = [...s.history.slice(0, s.ptr + 1), a.snap];
      const m = [...s.modes.slice(0, s.ptr + 1), a.mode ?? currentMode(s)];
      return { history: h, ptr: h.length - 1, modes: m };
    }
    case "undo":
      return s.ptr <= 0 ? s : { ...s, ptr: s.ptr - 1 };
    case "redo":
      return s.ptr >= s.history.length - 1 ? s : { ...s, ptr: s.ptr + 1 };
    case "reset": {
      const h = [...s.history.slice(0, s.ptr + 1), []];
      const m = [...s.modes.slice(0, s.ptr + 1), currentMode(s)];
      return { history: h, ptr: h.length - 1, modes: m };
    }
    case "clear":
      return initialHistory;
    case "load":
      return { history: [a.snap], ptr: 0, modes: [a.mode ?? currentMode(s)] };
    case "setMode": {
      if (currentMode(s) === a.mode) return s;
      const m = [...s.modes];
      m[s.ptr] = a.mode;
      return { ...s, modes: m };
    }
  }
}

export const canUndo = (s: HistState) => s.ptr > 0;
export const canRedo = (s: HistState) => s.ptr < s.history.length - 1;

/** Strips the live WaveSurfer reference so a region list can be stored as a snapshot. */
export function toSnapshot(regions: Region[] | RegionData[]): RegionData[] {
  return regions.map(({ id, start, end }) => ({ id, start, end }));
}
