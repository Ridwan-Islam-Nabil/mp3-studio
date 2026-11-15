/**
 * WaveSurfer lifecycle: creates the instance (+ Regions, Timeline, Minimap plugins) for
 * `fileUrl`, destroys it on change/unmount, mirrors playback events into state, calibrates
 * the zoom scale after `ready`, and applies the zoom slider.
 *
 * Region events are forwarded to the caller's handlers through `useEffectEvent`, so the
 * listeners registered once in the effect always call the latest handler.
 *
 * The caller passes `pluginRef` (the Regions plugin ref) because useRegionHistory needs the
 * same ref and must be created before this hook (its handlers are inputs here).
 */

import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import TimelinePlugin from "wavesurfer.js/dist/plugins/timeline.js";
import MinimapPlugin from "wavesurfer.js/dist/plugins/minimap.js";
import { calibrateZoomMin, sliderToZoom } from "../editorUtils";
import { C, cutColor } from "../theme";
import type { WsRegion } from "../types";

export interface UseWaveSurferOptions {
  fileUrl: string;
  /** Zoom slider position 0–100. */
  zoomSlider: number;
  pluginRef: RefObject<RegionsPlugin | null>;
  onRegionCreated: (region: WsRegion) => void;
  onRegionUpdated: (region: WsRegion) => void;
  onRegionDoubleClicked: (region: WsRegion) => void;
}

export function useWaveSurfer({
  fileUrl, zoomSlider, pluginRef, onRegionCreated, onRegionUpdated, onRegionDoubleClicked,
}: UseWaveSurferOptions) {
  const wsRef       = useRef<WaveSurfer | null>(null);
  const waveRef     = useRef<HTMLDivElement>(null);
  const minimapRef  = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const [duration, setDuration]       = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying]     = useState(false);
  /** Calibrated after `ready`: just above the natural fit-to-view px/sec. */
  const [zoomMin, setZoomMin]         = useState(1);

  const regionCreated       = useEffectEvent((r: WsRegion) => onRegionCreated(r));
  const regionUpdated       = useEffectEvent((r: WsRegion) => onRegionUpdated(r));
  const regionDoubleClicked = useEffectEvent((r: WsRegion) => onRegionDoubleClicked(r));

  // ─── Create / destroy ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!waveRef.current || !minimapRef.current || !timelineRef.current) return;

    const rp = RegionsPlugin.create();
    pluginRef.current = rp;

    const ws = WaveSurfer.create({
      container: waveRef.current,
      waveColor:     ["#7c3aed", "#1d4ed8"],  // purple → blue, same as the local app
      progressColor: ["#a78bfa", "#60a5fa"],
      cursorColor:   "#fff",
      cursorWidth:   2,
      barWidth: 2, barGap: 1, barRadius: 2,
      height: 360,
      normalize: true, // scale bars so the tallest always fills the full height
      url: fileUrl,
      plugins: [
        rp,
        TimelinePlugin.create({
          container: timelineRef.current,
          timeInterval: 30,
          primaryLabelInterval: 5,
          style: { fontSize: "11px", color: C.muted },
        }),
        MinimapPlugin.create({
          container: minimapRef.current,
          waveColor:     ["rgba(124,58,237,.55)", "rgba(29,78,216,.55)"],
          progressColor: ["rgba(167,139,250,.8)",  "rgba(96,165,250,.8)"],
          cursorColor:   "rgba(255,255,255,.7)",
          cursorWidth:   1,
          overlayColor:  "rgba(124,58,237,.12)",
          height: 46,
          barWidth: 1, barGap: 0,
          interact: true,
        }),
      ],
    });
    wsRef.current = ws;

    let calibrateTimer: ReturnType<typeof setTimeout> | undefined;
    ws.on("ready", (dur) => {
      setDuration(dur);
      // Calibrate the log zoom scale once layout has settled. The zoom effect below
      // re-applies the slider when zoomMin changes, so the timeline renders right away.
      calibrateTimer = setTimeout(() => {
        const container = waveRef.current?.parentElement;
        if (container && dur > 0) setZoomMin(calibrateZoomMin(container.offsetWidth, dur));
      }, 80);
    });
    ws.on("timeupdate", (t) => setCurrentTime(t));
    ws.on("play",   () => setIsPlaying(true));
    ws.on("pause",  () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));

    rp.enableDragSelection({ color: cutColor() });
    rp.on("region-created", (r) => regionCreated(r));
    rp.on("region-updated", (r) => regionUpdated(r));
    rp.on("region-double-clicked", (r) => regionDoubleClicked(r));

    return () => {
      clearTimeout(calibrateTimer);
      ws.destroy();
      if (wsRef.current === ws) wsRef.current = null;
      if (pluginRef.current === rp) pluginRef.current = null;
    };
  }, [fileUrl, pluginRef]);

  // ─── Zoom ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!wsRef.current || duration === 0) return; // no audio loaded yet
    try {
      wsRef.current.zoom(sliderToZoom(zoomSlider, zoomMin));
    } catch { /* WaveSurfer throws if audio is not ready — safe to ignore */ }
  }, [zoomSlider, zoomMin, duration]);

  return { wsRef, waveRef, minimapRef, timelineRef, duration, currentTime, isPlaying, zoomMin };
}
