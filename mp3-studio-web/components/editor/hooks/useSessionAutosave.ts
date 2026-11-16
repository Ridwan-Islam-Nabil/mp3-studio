/**
 * Session auto-save: remembers the cuts of each file in localStorage (see session.ts for the
 * key/format/cap) and restores them when the same file (name + size + lastModified) is
 * opened again.
 *
 * - Restore runs once, after WaveSurfer has decoded the file (`duration > 0`, needed to place
 *   regions and to clamp them). Restored cuts become the history baseline (`loadRegions`), so
 *   nothing new is pushed, and an info toast offers "Clear" (an undoable reset: Ctrl+Z brings
 *   them back).
 * - Saving starts only after that restore check, so the empty region list of a freshly mounted
 *   session never overwrites the stored cuts. Clearing all cuts deletes the entry.
 * - All storage access goes through session.ts, which swallows storage errors.
 * - Keep mode: the mode is stored with the ranges (`mode: "keep"`) and restored with them, so
 *   keep regions never come back as cuts.
 */

import { useEffect, useRef } from "react";
import { toSnapshot } from "../history";
import { loadSessionEntry, saveSession, sessionKey } from "../session";
import { useToast } from "../toast/ToastProvider";
import { getStorage } from "./browserStorage";
import type { Region, RegionData, RegionMode } from "../types";

interface Options {
  file: File;
  duration: number;
  regions: Region[];
  mode: RegionMode;
  loadRegions: (snap: RegionData[], mode: RegionMode) => void;
  clearRegions: () => void;
}

export function useSessionAutosave({ file, duration, regions, mode, loadRegions, clearRegions }: Options) {
  const toast = useToast();
  const key = sessionKey(file);
  const checkedRef = useRef(false); // restore attempted → saving allowed

  // Restore once the audio is decoded.
  useEffect(() => {
    if (duration <= 0 || checkedRef.current) return;
    checkedRef.current = true;
    const entry = loadSessionEntry(getStorage(), key, duration);
    if (!entry) return;
    const { cuts } = entry;
    loadRegions(cuts.map((c, i) => ({ id: `restored-${i}`, start: c.start, end: c.end })), entry.mode);
    const n = cuts.length;
    const what = entry.mode === "keep" ? `keep region${n === 1 ? "" : "s"}` : `cut${n === 1 ? "" : "s"}`;
    toast.show("info", `Restored ${n} ${what} from your last session`, undefined, {
      duration: 8000,
      action: { label: "Clear", onClick: clearRegions },
    });
  }, [duration, key, loadRegions, clearRegions, toast]);

  // Save on every change after the restore check.
  useEffect(() => {
    if (!checkedRef.current) return;
    saveSession(getStorage(), key, toSnapshot(regions), Date.now(), mode);
  }, [regions, mode, key]);
}
