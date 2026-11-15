/**
 * Undo/redo history of cut regions — a pure reducer (no React imports, unit-tested in
 * history.test.ts). Used through `useReducer` in hooks/useRegionHistory.ts.
 *
 * Why a reducer and not `useState` for the pointer: WaveSurfer event handlers are registered
 * once, inside an effect. A `useState` pointer captured there goes stale (undo once read
 * `history[undefined]`); a reducer always sees the current state.
 *
 * `history[ptr]` is always the current snapshot. `history[0]` is the empty starting state.
 */

import type { Region, RegionData } from "./types";

export interface HistState {
  history: RegionData[][];
  ptr: number;
}

export type HistAction =
  | { type: "push"; snap: RegionData[] } // record a new snapshot, dropping any redo branch
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset" }                    // record an empty snapshot (undoable "clear all cuts")
  | { type: "clear" };                   // forget everything (new file)

export const initialHistory: HistState = { history: [[]], ptr: 0 };

export function histReducer(s: HistState, a: HistAction): HistState {
  switch (a.type) {
    case "push": {
      const h = [...s.history.slice(0, s.ptr + 1), a.snap];
      return { history: h, ptr: h.length - 1 };
    }
    case "undo":
      return s.ptr <= 0 ? s : { ...s, ptr: s.ptr - 1 };
    case "redo":
      return s.ptr >= s.history.length - 1 ? s : { ...s, ptr: s.ptr + 1 };
    case "reset": {
      const h = [...s.history.slice(0, s.ptr + 1), []];
      return { history: h, ptr: h.length - 1 };
    }
    case "clear":
      return initialHistory;
  }
}

export const canUndo = (s: HistState) => s.ptr > 0;
export const canRedo = (s: HistState) => s.ptr < s.history.length - 1;

/** Strips the live WaveSurfer reference so a region list can be stored as a snapshot. */
export function toSnapshot(regions: Region[] | RegionData[]): RegionData[] {
  return regions.map(({ id, start, end }) => ({ id, start, end }));
}
