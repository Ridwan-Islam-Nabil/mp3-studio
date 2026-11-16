/**
 * Play or loop one cut region with the editor's own WaveSurfer instance (no second <audio>,
 * unlike the local app's mini-player).
 *
 *   ▶ (playRegion)   seek to the region start, play, pause at its end
 *   ⟲ (loopRegion)   same, but jump back to the start at the end — until stopped
 *   L / click again  stop
 *
 * One `timeupdate` listener does the work, reading the region's *live* bounds from
 * `regionsRef` (the WaveSurfer region object), so dragging/resizing/typing new times while it
 * plays takes effect immediately. The mode ends when:
 *   - the end is reached (play mode) → pause at the end
 *   - playback pauses or finishes for any reason (Space, ⏸, end of file)
 *   - the user seeks outside the region (click on the waveform, ←/→, seek bar) — playback
 *     continues normally from there
 *   - the region disappears (removed, undone) → pause
 *   - a new file loads: EditorSession remounts, WaveSurfer is destroyed with this listener.
 *
 * Must be called after useWaveSurfer (effects run in call order, so the instance exists when
 * this hook subscribes; under StrictMode both effects re-run in the same order).
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type WaveSurfer from "wavesurfer.js";
import type { Region } from "../types";

export interface ActiveRegion { id: string; loop: boolean }

/** A time jump bigger than this between two updates is a seek, not playback progress. */
const SEEK_JUMP_SECONDS = 0.75;

export function useRegionPlayback(
  wsRef: RefObject<WaveSurfer | null>,
  regionsRef: RefObject<Region[]>,
) {
  const [active, setActive] = useState<ActiveRegion | null>(null);
  const activeRef = useRef<ActiveRegion | null>(null);
  const lastTimeRef = useRef(0);

  const setMode = useCallback((next: ActiveRegion | null) => {
    activeRef.current = next;
    setActive(next);
  }, []);

  /** Ends region mode and pauses. */
  const stop = useCallback(() => {
    if (!activeRef.current) return;
    setMode(null);
    wsRef.current?.pause();
  }, [setMode, wsRef]);

  const start = useCallback((id: string, loop: boolean) => {
    const ws = wsRef.current;
    const region = regionsRef.current.find((r) => r.id === id);
    if (!ws || !region) return;
    setMode({ id, loop });
    lastTimeRef.current = region.wsRef.start; // our own seek is not a user seek
    ws.setTime(region.wsRef.start);
    void ws.play();
  }, [regionsRef, setMode, wsRef]);

  /** ▶ on a row: play that region once, or stop it if it is the one playing. */
  const playRegion = useCallback((id: string) => {
    if (activeRef.current?.id === id) stop();
    else start(id, false);
  }, [start, stop]);

  /** ⟲ on a row: loop that region, or stop if it is already looping. */
  const loopRegion = useCallback((id: string) => {
    const a = activeRef.current;
    if (a?.id === id && a.loop) stop();
    else if (a?.id === id) setMode({ id, loop: true }); // already playing it: keep going, now looping
    else start(id, true);
  }, [setMode, start, stop]);

  /** `L`: stop a loop (a one-shot region play just runs to its end). */
  const stopLoop = useCallback(() => {
    if (activeRef.current?.loop) stop();
  }, [stop]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;

    const onTime = (t: number) => {
      const a = activeRef.current;
      const last = lastTimeRef.current;
      lastTimeRef.current = t;
      if (!a) return;
      const region = regionsRef.current.find((r) => r.id === a.id);
      if (!region) { stop(); return; }
      const { start: rs, end: re } = region.wsRef;
      const jumped = Math.abs(t - last) > SEEK_JUMP_SECONDS;
      if (jumped && (t < rs || t > re)) { setMode(null); return; } // user seeked away
      if (t >= re) {
        if (a.loop) {
          lastTimeRef.current = rs;
          ws.setTime(rs);
        } else {
          setMode(null);
          ws.pause();
          ws.setTime(re);
        }
      }
    };
    // A loop whose region runs to the end of the file: the media element pauses/finishes on its
    // own before onTime sees t >= end, so restart from here instead of ending the loop.
    const onStopped = () => {
      const a = activeRef.current;
      if (!a) return;
      const region = regionsRef.current.find((r) => r.id === a.id);
      if (a.loop && region && ws.getCurrentTime() >= region.wsRef.end - 0.05) {
        lastTimeRef.current = region.wsRef.start;
        ws.setTime(region.wsRef.start);
        void ws.play();
        return;
      }
      setMode(null);
    };

    const unsubs = [
      ws.on("timeupdate", onTime),
      ws.on("pause", onStopped),
      ws.on("finish", onStopped),
    ];
    return () => unsubs.forEach((u) => u());
  }, [wsRef, regionsRef, setMode, stop]);

  return { active, playRegion, loopRegion, stopLoop, stop };
}

export type RegionPlayback = ReturnType<typeof useRegionPlayback>;
