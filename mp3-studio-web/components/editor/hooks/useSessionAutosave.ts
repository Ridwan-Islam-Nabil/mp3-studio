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
 */

import { useEffect, useRef } from "react";
import { toSnapshot } from "../history";
import { loadSession, saveSession, sessionKey, type StorageLike } from "../session";
import { useToast } from "../toast/ToastProvider";
import type { Region, RegionData } from "../types";

interface Options {
  file: File;
  duration: number;
  regions: Region[];
  loadRegions: (snap: RegionData[]) => void;
  clearRegions: () => void;
}

/** localStorage, or null where accessing it throws (sandboxed iframes, blocked site data). */
function getStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function useSessionAutosave({ file, duration, regions, loadRegions, clearRegions }: Options) {
  const toast = useToast();
  const key = sessionKey(file);
  const checkedRef = useRef(false); // restore attempted → saving allowed

  // Restore once the audio is decoded.
  useEffect(() => {
    if (duration <= 0 || checkedRef.current) return;
    checkedRef.current = true;
    const cuts = loadSession(getStorage(), key, duration);
    if (!cuts) return;
    loadRegions(cuts.map((c, i) => ({ id: `restored-${i}`, start: c.start, end: c.end })));
    const n = cuts.length;
    toast.show("info", `Restored ${n} cut${n === 1 ? "" : "s"} from your last session`, undefined, {
      duration: 8000,
      action: { label: "Clear", onClick: clearRegions },
    });
  }, [duration, key, loadRegions, clearRegions, toast]);

  // Save on every change after the restore check.
  useEffect(() => {
    if (!checkedRef.current) return;
    saveSession(getStorage(), key, toSnapshot(regions));
  }, [regions, key]);
}
