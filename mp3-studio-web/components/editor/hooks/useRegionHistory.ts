/**
 * Regions + undo/redo history (+ the region mode: cut / keep).
 *
 * Owns `regions` (React state, source of truth for export), `regionsRef` (always-current
 * mirror for code that runs inside WaveSurfer callbacks) and the history reducer.
 *
 * Every change goes through `commit(next)`: update the ref, set state once, push one snapshot.
 * `commit` is deliberately NOT called inside a `setRegions` updater — StrictMode runs
 * updaters twice, which used to push every history entry twice.
 *
 * Restore guard: undo/redo re-create WaveSurfer regions, which fires `region-created`.
 * `isRestoringRef` is true while that happens and the `on*` handlers ignore events then,
 * so undo/redo never push new history entries. Re-created regions keep their ids, so later
 * region events (drag, double-click) still match their entry in `regions`.
 *
 * Mode: each history entry records the mode (history.ts), so `mode` is derived from the
 * reducer and undoing a mode switch switches back too. Keep regions are green, cuts red
 * (`regionColor`). `switchMode(to, ranges)` replaces all regions and the mode in one undoable
 * step; with no regions it just changes the mode (`setMode`, nothing to undo).
 *
 * Also: `updateRegionTimes` (typed-in times in the region list — one history entry),
 * `loadRegions` (session auto-save restore — becomes the history baseline, no entry pushed),
 * `addRegions` / `replaceRegions` (remove silence — one history entry for many regions).
 */

import { useCallback, useEffect, useReducer, useRef, useState, type RefObject } from "react";
import type RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import { trackRedo, trackRegionCreated, trackUndo } from "@/lib/analytics";
import { canRedo, canUndo, currentMode, histReducer, historyWithMode, toSnapshot } from "../history";
import { KEEP_COLOR, regionColor } from "../theme";
import type { Region, RegionData, RegionMode, WsRegion } from "../types";

/** A region to create: times, optionally an id to keep. */
export type RegionInput = { id?: string; start: number; end: number };

export function useRegionHistory(pluginRef: RefObject<RegionsPlugin | null>, initialMode: RegionMode = "cut") {
  const [regions, setRegions] = useState<Region[]>([]);
  const regionsRef = useRef<Region[]>([]);
  const [hist, dispatch] = useReducer(histReducer, initialMode, historyWithMode);
  const isRestoringRef = useRef(false);
  const mode = currentMode(hist);
  /** Mode for WaveSurfer callbacks; updated synchronously by every mode change below. */
  const modeRef = useRef<RegionMode>(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  /** Replace the region list and record it as one history step. */
  const commit = useCallback((next: Region[], nextMode?: RegionMode) => {
    regionsRef.current = next;
    setRegions(next);
    dispatch({ type: "push", snap: toSnapshot(next), mode: nextMode });
  }, []);

  /** Removes all WaveSurfer regions and creates `list` in `m`'s color (no history push). */
  const recreate = useCallback((list: RegionInput[], m: RegionMode): Region[] | null => {
    const plugin = pluginRef.current;
    if (!plugin) return null;
    isRestoringRef.current = true;
    try {
      plugin.getRegions().forEach((r) => r.remove());
      return list.map((d) => {
        const ws = plugin.addRegion({ ...(d.id ? { id: d.id } : {}), start: d.start, end: d.end, color: regionColor(m), drag: true, resize: true });
        return { id: ws.id, start: d.start, end: d.end, wsRef: ws };
      });
    } finally {
      isRestoringRef.current = false;
    }
  }, [pluginRef]);

  /** Re-create regions from a snapshot (no history push). */
  const restoreSnapshot = useCallback((snap: RegionData[], m: RegionMode) => {
    if (!Array.isArray(snap)) return;
    const restored = recreate(snap, m);
    if (!restored) return;
    modeRef.current = m;
    regionsRef.current = restored;
    setRegions(restored);
  }, [recreate]);

  /**
   * Replaces all regions with `snap` and makes it the start of history (nothing to undo past
   * it). Used to restore an auto-saved session.
   */
  const loadRegions = useCallback((snap: RegionData[], m: RegionMode = modeRef.current) => {
    restoreSnapshot(snap, m);
    dispatch({ type: "load", snap: toSnapshot(snap), mode: m });
  }, [restoreSnapshot]);

  const undo = useCallback(() => {
    if (!canUndo(hist)) return;
    const snap = hist.history[hist.ptr - 1];
    dispatch({ type: "undo" });
    restoreSnapshot(snap, hist.modes[hist.ptr - 1] ?? "cut");
    trackUndo();
  }, [hist, restoreSnapshot]);

  const redo = useCallback(() => {
    if (!canRedo(hist)) return;
    const snap = hist.history[hist.ptr + 1];
    dispatch({ type: "redo" });
    restoreSnapshot(snap, hist.modes[hist.ptr + 1] ?? "cut");
    trackRedo();
  }, [hist, restoreSnapshot]);

  /** "Clear all regions" — undoable. */
  const reset = useCallback(() => {
    const plugin = pluginRef.current;
    if (!plugin) return;
    plugin.getRegions().forEach((r) => r.remove());
    regionsRef.current = [];
    setRegions([]);
    dispatch({ type: "reset" });
  }, [pluginRef]);

  const removeRegion = useCallback((id: string) => {
    regionsRef.current.find((r) => r.id === id)?.wsRef.remove();
    commit(regionsRef.current.filter((r) => r.id !== id));
  }, [commit]);

  /** Sets a region's start/end (already validated): moves the WaveSurfer region, one history entry. */
  const updateRegionTimes = useCallback((id: string, start: number, end: number) => {
    const region = regionsRef.current.find((r) => r.id === id);
    if (!region || (region.start === start && region.end === end)) return;
    // setOptions re-renders the region without emitting region-updated, so commit here.
    region.wsRef.setOptions({ start, end });
    commit(regionsRef.current.map((r) => (r.id === id ? { ...r, start, end } : r)));
  }, [commit]);

  /** Adds several regions in the current mode as ONE history step. */
  const addRegions = useCallback((ranges: RegionInput[]) => {
    const plugin = pluginRef.current;
    if (!plugin || ranges.length === 0) return;
    const m = modeRef.current;
    isRestoringRef.current = true;
    let added: Region[];
    try {
      added = ranges.map((d) => {
        const ws = plugin.addRegion({ start: d.start, end: d.end, color: regionColor(m), drag: true, resize: true });
        return { id: ws.id, start: d.start, end: d.end, wsRef: ws };
      });
    } finally {
      isRestoringRef.current = false;
    }
    commit([...regionsRef.current, ...added]);
  }, [pluginRef, commit]);

  /** Replaces all regions (and optionally the mode) as ONE history step. */
  const replaceRegions = useCallback((ranges: RegionInput[], m: RegionMode = modeRef.current) => {
    const next = recreate(ranges, m);
    if (!next) return;
    modeRef.current = m;
    commit(next, m);
  }, [recreate, commit]);

  /**
   * Switches cut/keep mode. With regions, `ranges` (converted or relabelled by the caller)
   * replace them in one undoable step; without regions only the mode changes.
   */
  const switchMode = useCallback((to: RegionMode, ranges: RegionInput[] = []) => {
    if (to === modeRef.current) return;
    if (regionsRef.current.length === 0) {
      modeRef.current = to;
      dispatch({ type: "setMode", mode: to });
      return;
    }
    replaceRegions(ranges, to);
  }, [replaceRegions]);

  // ─── WaveSurfer region events (wired up by useWaveSurfer) ───────────────────

  const onRegionCreated = useCallback((region: WsRegion) => {
    if (isRestoringRef.current) return;
    // Drag-created regions get the drag-selection color; make sure keep regions are green.
    if (modeRef.current === "keep" && region.color !== KEEP_COLOR) region.setOptions({ color: KEEP_COLOR });
    commit([...regionsRef.current, { id: region.id, start: region.start, end: region.end, wsRef: region }]);
    trackRegionCreated();
  }, [commit]);

  const onRegionUpdated = useCallback((region: WsRegion) => {
    if (isRestoringRef.current) return;
    commit(regionsRef.current.map((r) =>
      r.id === region.id ? { ...r, start: region.start, end: region.end } : r
    ));
  }, [commit]);

  const onRegionDoubleClicked = useCallback((region: WsRegion) => {
    if (isRestoringRef.current || !region) return;
    region.remove();
    commit(regionsRef.current.filter((r) => r.id !== region.id));
  }, [commit]);

  return {
    regions,
    regionsRef,
    mode,
    canUndo: canUndo(hist),
    canRedo: canRedo(hist),
    undo,
    redo,
    reset,
    removeRegion,
    updateRegionTimes,
    loadRegions,
    addRegions,
    replaceRegions,
    switchMode,
    onRegionCreated,
    onRegionUpdated,
    onRegionDoubleClicked,
  };
}

export type RegionHistory = ReturnType<typeof useRegionHistory>;
