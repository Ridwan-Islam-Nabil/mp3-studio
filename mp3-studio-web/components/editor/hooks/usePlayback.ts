/**
 * Transport + playback settings for the WaveSurfer instance in `wsRef`:
 * play/pause, ±5 s skip, seek, playback speed, volume and mute.
 * Must be called after useWaveSurfer (effects run in call order, so the instance exists
 * by the time the speed/volume effects run).
 */

import { useCallback, useEffect, useState, type RefObject } from "react";
import type WaveSurfer from "wavesurfer.js";

export const SKIP_SECONDS = 5;

export function usePlayback(wsRef: RefObject<WaveSurfer | null>) {
  const [speed, setSpeed]   = useState(1);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted]   = useState(false);

  useEffect(() => { wsRef.current?.setPlaybackRate(speed); }, [wsRef, speed]);
  useEffect(() => { wsRef.current?.setVolume(muted ? 0 : volume); }, [wsRef, volume, muted]);

  const togglePlay = useCallback(() => { wsRef.current?.playPause(); }, [wsRef]);
  const skip       = useCallback((sec: number) => { wsRef.current?.skip(sec); }, [wsRef]);
  /** Seek to a fraction 0–1 of the duration. */
  const seekTo     = useCallback((fraction: number) => { wsRef.current?.seekTo(fraction); }, [wsRef]);

  /** Moving the volume slider also unmutes. */
  const changeVolume = useCallback((v: number) => { setVolume(v); setMuted(false); }, []);
  const toggleMute   = useCallback(() => setMuted((m) => !m), []);

  return { speed, setSpeed, volume, changeVolume, muted, toggleMute, togglePlay, skip, seekTo };
}

export type Playback = ReturnType<typeof usePlayback>;
