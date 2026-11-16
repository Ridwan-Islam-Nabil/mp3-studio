/**
 * Cut regions + undo/redo history.
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
 * Also: `updateRegionTimes` (typed-in times in the region list — one history entry) and
 * `loadRegions` (session auto-save restore — becomes the history baseline, no entry pushed).
 */

import { useCallback, useReducer, useRef, useState, type RefObject } from "react";
import type RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import { trackRedo, trackRegionCreated, trackUndo } from "@/lib/analytics";
import { canRedo, canUndo, histReducer, initialHistory, toSnapshot } from "../history";
import { cutColor } from "../theme";
import type { Region, RegionData, WsRegion } from "../types";

export function useRegionHistory(pluginRef: RefObject<RegionsPlugin | null>) {
  const [regions, setRegions] = useState<Region[]>([]);
  const regionsRef = useRef<Region[]>([]);
  const [hist, dispatch] = useReducer(histReducer, initialHistory);
  const isRestoringRef = useRef(false);

  /** Replace the region list and record it as one history step. */
  const commit = useCallback((next: Region[]) => {
    regionsRef.current = next;
    setRegions(next);
    dispatch({ type: "push", snap: toSnapshot(next) });
  }, []);

  /** Remove all WaveSurfer regions and re-create them from a snapshot (no history push). */
  const restoreSnapshot = useCallback((snap: RegionData[]) => {
    const plugin = pluginRef.current;
    if (!plugin || !Array.isArray(snap)) return;
    isRestoringRef.current = true;
    plugin.getRegions().forEach((r) => r.remove());
    const restored: Region[] = snap.map((d) => ({
      ...d,
      wsRef: plugin.addRegion({ id: d.id, start: d.start, end: d.end, color: cutColor(), drag: true, resize: true }),
    }));
    isRestoringRef.current = false;
    regionsRef.current = restored;
    setRegions(restored);
  }, [pluginRef]);

  /**
   * Replaces all regions with `snap` and makes it the start of history (nothing to undo past
   * it). Used to restore an auto-saved session.
   */
  const loadRegions = useCallback((snap: RegionData[]) => {
    restoreSnapshot(snap);
    dispatch({ type: "load", snap: toSnapshot(snap) });
  }, [restoreSnapshot]);

  const undo = useCallback(() => {
    if (!canUndo(hist)) return;
    const snap = hist.history[hist.ptr - 1];
    dispatch({ type: "undo" });
    restoreSnapshot(snap);
    trackUndo();
  }, [hist, restoreSnapshot]);

  const redo = useCallback(() => {
    if (!canRedo(hist)) return;
    const snap = hist.history[hist.ptr + 1];
    dispatch({ type: "redo" });
    restoreSnapshot(snap);
    trackRedo();
  }, [hist, restoreSnapshot]);

  /** "Clear all cuts" — undoable. */
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

  // ─── WaveSurfer region events (wired up by useWaveSurfer) ───────────────────

  const onRegionCreated = useCallback((region: WsRegion) => {
    if (isRestoringRef.current) return;
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
    canUndo: canUndo(hist),
    canRedo: canRedo(hist),
    undo,
    redo,
    reset,
    removeRegion,
    updateRegionTimes,
    loadRegions,
    onRegionCreated,
    onRegionUpdated,
    onRegionDoubleClicked,
  };
}
