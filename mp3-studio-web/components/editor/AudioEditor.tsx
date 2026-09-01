"use client";
/**
 * components/editor/AudioEditor.tsx
 *
 * COLOR SYSTEM — matches the desktop Flask app exactly:
 *   --bg:          #06060f   page background
 *   --surface:     #0d0d1c
 *   --card:        #111128   card background
 *   --card-border: #1e1e40
 *   --primary:     #7c3aed   purple
 *   --accent:      #06b6d4   cyan
 *
 * Waveform gradient colors: ["#7c3aed","#1d4ed8"] → ["#a78bfa","#60a5fa"]
 * Waveform height: 460px  (same as desktop, increased from 360)
 * Background: three ambient orbs (purple, cyan, blue) same as desktop
 *
 * HISTORY:
 *   useReducer-based — fixes stale closure bug where undo/redo could
 *   access history[undefined] due to histPtr captured at effect creation time.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import TimelinePlugin from "wavesurfer.js/dist/plugins/timeline.js";
import MinimapPlugin from "wavesurfer.js/dist/plugins/minimap.js";
import { loadFFmpeg, trimAndExport, type CutRegion } from "@/lib/ffmpeg";
import {
  trackFileUploaded,
  trackExportCompleted,
  trackPreviewOpened,
  trackRegionCreated,
  trackUndo,
  trackRedo,
} from "@/lib/analytics";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RegionData { id: string; start: number; end: number; }
interface Region extends RegionData {
  wsRef: ReturnType<RegionsPlugin["addRegion"]>;
}

// ─── History reducer (avoids stale closure on histPtr) ───────────────────────

interface HistState { history: RegionData[][]; ptr: number; }
type HistAction =
  | { type: "push"; snap: RegionData[] }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset" }
  | { type: "clear" };

function histReducer(s: HistState, a: HistAction): HistState {
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
      return { history: [[]], ptr: 0 };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00.0";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${m}:${sec.toString().padStart(2, "0")}.${ms}`;
}

const CUT_COLORS = [
  "rgba(239,68,68,0.3)",
  "rgba(220,38,38,0.3)",
  "rgba(248,113,113,0.28)",
];
const cutColor = () => CUT_COLORS[Math.floor(Math.random() * CUT_COLORS.length)];

// ─── Zoom helpers (logarithmic, calibrated per-audio — same as desktop) ─────

const ZOOM_MAX = 2000; // px/sec ceiling

/**
 * Convert slider position 0–100 → actual px/sec on a log curve.
 * zoomMin is calibrated after audio loads: just above the natural fit-to-view
 * value, so position 0 always produces a visible zoom effect.
 */
function sliderToZoom(s: number, zoomMin: number): number {
  const logMin = Math.log(zoomMin);
  const logMax = Math.log(ZOOM_MAX);
  return Math.round(Math.exp(logMin + (s / 100) * (logMax - logMin)));
}

/** Format px/sec into a human-readable badge ("25×", "1.5k×") */
function fmtZoom(pxPerSec: number): string {
  if (pxPerSec >= 1000) return `${(pxPerSec / 1000).toFixed(1)}k×`;
  return `${pxPerSec}×`;
}

/**
 * Generates a dynamic linear-gradient for a range input track so the filled
 * portion (left of thumb) uses a color gradient and the unfilled portion fades.
 * Same technique as the desktop app's updateZoomUI().
 */
function sliderBg(value: number, min: number, max: number, c1: string, c2: string): string {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return `linear-gradient(90deg, ${c1} 0%, ${c2} ${pct}%, rgba(255,255,255,.12) ${pct}%, rgba(255,255,255,.12) 100%)`;
}

// ─── Design tokens (exact match to desktop style.css) ─────────────────────

const C = {
  bg:         "#06060f",
  surface:    "#0d0d1c",
  card:       "#111128",
  border:     "#1e1e40",
  primary:    "#7c3aed",
  primaryDim: "rgba(124,58,237,0.15)",
  accent:     "#06b6d4",
  error:      "#ef4444",
  success:    "#10b981",
  text:       "#f1f5f9",
  muted:      "#94a3b8",
  dim:        "#475569",
  shadow:     "0 4px 32px rgba(0,0,0,.55)",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function AudioEditor() {
  // Source
  const [file, setFile]             = useState<File | null>(null);
  const [fileUrl, setFileUrl]       = useState<string | null>(null);
  const [duration, setDuration]     = useState(0);
  const [outputName, setOutputName] = useState("output");

  // Playback
  const [isPlaying, setIsPlaying]     = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [zoomSlider, setZoomSlider]   = useState(0);   // 0–100 log slider position
  const zoomMinRef = useRef(1);                         // calibrated after audio loads
  const [speed, setSpeed]             = useState(1);
  const [volume, setVolume]           = useState(1);
  const [muted, setMuted]             = useState(false);

  // Regions — regionsRef mirrors state so event handlers can read current value
  // without stale closure AND without calling dispatchHist inside a setRegions updater
  // (which React StrictMode would invoke twice, doubling every history push).
  const [regions, setRegions] = useState<Region[]>([]);
  const regionsRef = useRef<Region[]>([]);
  // Keep ref in sync whenever state changes
  useEffect(() => { regionsRef.current = regions; }, [regions]);

  // History — useReducer so event handlers can dispatch without stale closure
  const [hist, dispatchHist] = useReducer(histReducer, { history: [[]], ptr: 0 });
  const canUndo = hist.ptr > 0;
  const canRedo = hist.ptr < hist.history.length - 1;

  // Export
  const [exporting, setExporting]           = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportDone, setExportDone]         = useState(false);

  // Preview
  const [previewing, setPreviewing]           = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewUrl, setPreviewUrl]           = useState<string | null>(null);
  const [showPreview, setShowPreview]         = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Upload drag
  const [dragging, setDragging] = useState(false);

  // WaveSurfer
  const wsRef        = useRef<WaveSurfer | null>(null);
  const wsRegionsRef = useRef<RegionsPlugin | null>(null);
  const waveRef      = useRef<HTMLDivElement>(null);
  const minimapRef   = useRef<HTMLDivElement>(null);
  const timelineRef  = useRef<HTMLDivElement>(null);

  // Zoom ref — lets the ready handler see the current slider position without stale closure
  const zoomRef = useRef(zoomSlider);
  useEffect(() => { zoomRef.current = zoomSlider; }, [zoomSlider]);

  // Flag: true while restoreSnapshot is running — suppresses region-created handler
  const isRestoringRef = useRef(false);

  // Hover cursor state
  const [cursorTime, setCursorTime]     = useState<number | null>(null);
  const waveWrapRef = useRef<HTMLDivElement>(null);

  // Fullscreen
  const [fullscreen, setFullscreen] = useState(false);

  // ─── History helpers ─────────────────────────────────────────────────────

  /** Restore a snapshot: remove all ws regions, recreate from data. */
  const restoreSnapshot = useCallback((snap: RegionData[]) => {
    if (!wsRegionsRef.current || !Array.isArray(snap)) return;
    isRestoringRef.current = true;
    wsRegionsRef.current.getRegions().forEach((r) => r.remove());
    const restored: Region[] = snap.map((d) => {
      const wsR = wsRegionsRef.current!.addRegion({
        start: d.start, end: d.end, color: cutColor(), drag: true, resize: true,
      });
      return { ...d, wsRef: wsR };
    });
    isRestoringRef.current = false;
    regionsRef.current = restored;
    setRegions(restored);
  }, []);

  const undo = () => {
    if (!canUndo) return;
    const snap = hist.history[hist.ptr - 1];
    dispatchHist({ type: "undo" });
    restoreSnapshot(snap);
    trackUndo();
  };

  const redo = () => {
    if (!canRedo) return;
    const snap = hist.history[hist.ptr + 1];
    dispatchHist({ type: "redo" });
    restoreSnapshot(snap);
    trackRedo();
  };

  const reset = () => {
    if (!wsRegionsRef.current) return;
    wsRegionsRef.current.getRegions().forEach((r) => r.remove());
    regionsRef.current = [];
    setRegions([]);
    dispatchHist({ type: "reset" });
  };

  // ─── File handling ────────────────────────────────────────────────────────

  const handleFile = useCallback((f: File) => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }

    const url = URL.createObjectURL(f);
    setFile(f);
    setFileUrl(url);
    regionsRef.current = [];
    setRegions([]);
    // Track after we know the duration (fires in ws.on("ready")); capture format + size now
    trackFileUploaded({
      format: f.name.split(".").pop()?.toLowerCase() ?? "unknown",
      fileSizeMb: Math.round((f.size / 1024 / 1024) * 10) / 10,
      durationSec: 0, // updated in ready handler via a separate call
    });
    dispatchHist({ type: "clear" });
    setIsPlaying(false); setCurrentTime(0); setDuration(0);
    setExportDone(false); setShowPreview(false);
    setZoomSlider(0); setSpeed(1); setVolume(1); setMuted(false);
    setOutputName(f.name.replace(/\.[^.]+$/, "") || "output");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl, previewUrl]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  }, [handleFile]);

  // ─── WaveSurfer init ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!waveRef.current || !minimapRef.current || !timelineRef.current || !fileUrl) return;

    wsRef.current?.destroy();

    const rp = RegionsPlugin.create();
    wsRegionsRef.current = rp;

    const ws = WaveSurfer.create({
      container: waveRef.current,
      // Gradient arrays — purple to blue, same as desktop app
      waveColor:     ["#7c3aed", "#1d4ed8"],
      progressColor: ["#a78bfa", "#60a5fa"],
      cursorColor:   "#fff",
      cursorWidth:   2,
      barWidth: 2, barGap: 1, barRadius: 2,
      height: 360,
      normalize:     true,   // scale bars so the tallest always fills full height
      url: fileUrl,
      plugins: [
        rp,
        TimelinePlugin.create({
          container: timelineRef.current,
          primaryColor:       "#475569",
          secondaryColor:     "#334155",
          primaryFontColor:   "#94a3b8",
          secondaryFontColor: "#64748b",
          timeInterval: 30,
          primaryLabelInterval: 5,
          style: { fontSize: "11px" },
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

    ws.on("ready", (dur) => {
      setDuration(dur);
      // Calibrate the log zoom scale: find the natural fit-to-view px/sec and set
      // _zoomMin just above it, so slider position 0 always produces a visible zoom.
      setTimeout(() => {
        const container = waveRef.current?.parentElement;
        if (container && dur > 0) {
          const naturalFit = container.offsetWidth / dur;
          zoomMinRef.current = Math.max(1, Math.ceil(naturalFit) + 1);
        }
        // Apply current slider position so Timeline renders immediately
        const pxPerSec = sliderToZoom(zoomRef.current, zoomMinRef.current);
        ws.zoom(pxPerSec);
      }, 80);
    });
    ws.on("timeupdate", (t) => setCurrentTime(t));
    ws.on("play",   () => setIsPlaying(true));
    ws.on("pause",  () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));

    rp.enableDragSelection({ color: cutColor() });

    // IMPORTANT: dispatchHist is called at the top level (not inside setRegions updater).
    // React StrictMode invokes functional updaters twice in dev to detect side effects.
    // Calling dispatchHist inside an updater would push two identical history entries,
    // making undo need two clicks to see a change.
    // Fix: use regionsRef (always-current mirror of regions state) so we can compute
    // the new array imperatively, call setRegions(next) once, then dispatchHist once.

    rp.on("region-created", (region) => {
      if (isRestoringRef.current) return;
      const next = [...regionsRef.current, { id: region.id, start: region.start, end: region.end, wsRef: region }];
      regionsRef.current = next;
      setRegions(next);
      dispatchHist({ type: "push", snap: next.map(({ id, start, end }) => ({ id, start, end })) });
      trackRegionCreated();
    });

    rp.on("region-updated", (region) => {
      if (isRestoringRef.current) return;
      const next = regionsRef.current.map((r) =>
        r.id === region.id ? { ...r, start: region.start, end: region.end } : r
      );
      regionsRef.current = next;
      setRegions(next);
      dispatchHist({ type: "push", snap: next.map(({ id, start, end }) => ({ id, start, end })) });
    });

    rp.on("region-dblclick", (region) => {
      if (isRestoringRef.current) return;
      region.remove();
      const next = regionsRef.current.filter((r) => r.id !== region.id);
      regionsRef.current = next;
      setRegions(next);
      dispatchHist({ type: "push", snap: next.map(({ id, start, end }) => ({ id, start, end })) });
    });

    return () => { ws.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl]);

  // ─── Slider sync ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!wsRef.current || duration === 0) return; // no audio loaded yet
    try {
      const pxPerSec = sliderToZoom(zoomSlider, zoomMinRef.current);
      wsRef.current.zoom(pxPerSec);
    } catch { /* WaveSurfer throws if audio not ready — safe to ignore */ }
  }, [zoomSlider, duration]);
  // Esc closes fullscreen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { wsRef.current?.setPlaybackRate(speed); }, [speed]);
  useEffect(() => { wsRef.current?.setVolume(muted ? 0 : volume); }, [volume, muted]);

  // ─── Playback ────────────────────────────────────────────────────────────

  const togglePlay = () => wsRef.current?.playPause();
  const skipBack   = () => wsRef.current?.skip(-5);
  const skipFwd    = () => wsRef.current?.skip(5);
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) =>
    wsRef.current?.seekTo(Number(e.target.value) / 1000);

  // ─── Mark to Cut ─────────────────────────────────────────────────────────

  const markToCut = () => {
    if (!wsRegionsRef.current || duration === 0) return;
    const start = Math.max(0, currentTime - 5);
    const end   = Math.min(duration, currentTime + 5);
    wsRegionsRef.current.addRegion({ start, end, color: cutColor(), drag: true, resize: true });
    // region-created listener handles state + history
  };

  // ─── Remove region ───────────────────────────────────────────────────────

  const removeRegion = useCallback((id: string) => {
    const r = regionsRef.current.find((r) => r.id === id);
    r?.wsRef.remove();
    const next = regionsRef.current.filter((r) => r.id !== id);
    regionsRef.current = next;
    setRegions(next);
    dispatchHist({ type: "push", snap: next.map(({ id, start, end }) => ({ id, start, end })) });
  }, []);

  // ─── FFmpeg runner ────────────────────────────────────────────────────────

  const runFFmpeg = async (onProg: (p: number) => void): Promise<Blob> => {
    if (!file) throw new Error("No file loaded.");
    await loadFFmpeg((p) => onProg(Math.round(p * 0.2)));
    const cuts: CutRegion[] = regions.map(({ start, end }) => ({ start, end }));
    return trimAndExport(file, cuts, duration, (p) => onProg(20 + Math.round(p * 0.8)));
  };

  // ─── Preview ─────────────────────────────────────────────────────────────

  const handlePreview = async () => {
    if (!file || previewing || exporting) return;
    setPreviewing(true); setPreviewProgress(0);
    try {
      const blob = await runFFmpeg((p) => setPreviewProgress(p));
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
      setShowPreview(true);
      trackPreviewOpened({ cutCount: regions.length });
    } catch (e) { alert("Preview failed.\n" + String(e)); }
    finally { setPreviewing(false); }
  };

  const closePreview = () => {
    setShowPreview(false);
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
  };

  const downloadPreview = () => {
    if (!previewUrl) return;
    const a = document.createElement("a");
    a.href = previewUrl; a.download = (outputName || "output") + ".mp3"; a.click();
    setExportDone(true); closePreview();
  };

  // ─── Export ──────────────────────────────────────────────────────────────

  const handleExport = async () => {
    if (!file || exporting || previewing) return;
    setExporting(true); setExportProgress(0); setExportDone(false);
    try {
      const blob = await runFFmpeg((p) => setExportProgress(p));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = (outputName || "output") + ".mp3"; a.click();
      URL.revokeObjectURL(url);
      setExportDone(true);
      const cutDur = regions.reduce((s, r) => s + (r.end - r.start), 0);
      trackExportCompleted({
        cutCount: regions.length,
        durationSec: Math.round(duration),
        outputDurationSec: Math.round(duration - cutDur),
      });
    } catch (e) { alert("Export failed.\n" + String(e)); }
    finally { setExporting(false); }
  };

  const isProcessing = exporting || previewing;
  const seekPct = duration > 0 ? (currentTime / duration) * 1000 : 0;

  // ─── Shared button styles ─────────────────────────────────────────────────

  const ghostBtn = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: "transparent", border: `1px solid ${C.border}`, color: C.muted,
    borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600,
    cursor: "pointer", transition: "all .15s", display: "inline-flex", alignItems: "center", gap: 5,
    ...extra,
  });

  const primaryBtn = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: C.primary, border: "none", color: "#fff",
    borderRadius: 8, padding: "7px 20px", fontSize: 13, fontWeight: 700,
    cursor: "pointer", position: "relative", overflow: "hidden",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    ...extra,
  });

  const iconBtn = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: "transparent", border: `1px solid ${C.border}`, color: C.muted,
    borderRadius: 8, padding: "7px 11px", fontSize: 16,
    cursor: "pointer", transition: "all .15s", ...extra,
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, paddingBottom: 80, position: "relative", overflow: "hidden" }}>

      {/* ── Ambient background orbs (same as desktop) ── */}
      <div style={{ position: "fixed", width: 520, height: 520, borderRadius: "50%", filter: "blur(90px)", background: "radial-gradient(circle, rgba(124,58,237,.18) 0%, transparent 70%)", top: -180, left: -180, pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", width: 420, height: 420, borderRadius: "50%", filter: "blur(90px)", background: "radial-gradient(circle, rgba(6,182,212,.12) 0%, transparent 70%)", bottom: -160, right: -160, pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", width: 300, height: 300, borderRadius: "50%", filter: "blur(90px)", background: "radial-gradient(circle, rgba(29,78,216,.10) 0%, transparent 70%)", top: "40%", left: "50%", transform: "translate(-50%,-50%)", pointerEvents: "none", zIndex: 0 }} />

      {/* ── Preview Modal ── */}
      {showPreview && previewUrl && (
        <div onClick={closePreview} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, width: "min(90vw,540px)", padding: 32, boxShadow: C.shadow }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Preview</h2>
              <button onClick={closePreview} style={{ background: "none", border: "none", color: C.muted, fontSize: 22, cursor: "pointer" }}>×</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
              <label style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>Save as:</label>
              <input value={outputName} onChange={(e) => setOutputName(e.target.value)}
                style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", color: C.text, fontSize: 13, flex: 1, outline: "none" }} />
              <span style={{ fontSize: 12, color: C.dim }}>.mp3</span>
            </div>
            <audio ref={previewAudioRef} src={previewUrl} controls autoPlay style={{ width: "100%", marginBottom: 14, borderRadius: 8 }} />
            <p style={{ fontSize: 12, color: C.dim, marginBottom: 20, lineHeight: 1.6 }}>
              {regions.length === 0 ? "No cuts — full audio." : `${regions.length} cut${regions.length > 1 ? "s" : ""} removed.`} Listen, then download.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={closePreview} style={ghostBtn()}>Continue Editing</button>
              <button onClick={downloadPreview} style={{ ...primaryBtn(), padding: "9px 20px" }}>⬇ Download MP3</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Content (above orbs) ── */}
      <div style={{ position: "relative", zIndex: 1 }}>

        {/* ── Topbar ── */}
        <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px clamp(12px,4vw,48px)", borderBottom: `1px solid ${C.border}`, background: "rgba(6,6,15,0.95)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
          <Link href="/" style={{ fontWeight: 900, fontSize: 17, textDecoration: "none" }}>
            <span style={{ background: "linear-gradient(135deg,#9d67f5,#06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>MP3</span>
            {" "}<span style={{ color: C.text }}>Studio</span>
          </Link>
          <span style={{ color: C.dim, fontSize: 12 }}>All processing runs in your browser — nothing is uploaded</span>
        </nav>

        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px clamp(12px,3vw,40px)", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── Upload zone ── */}
          {!file && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => document.getElementById("file-input")?.click()}
              style={{ background: dragging ? C.primaryDim : C.card, border: `2px dashed ${dragging ? C.primary : C.border}`, borderRadius: 14, padding: "clamp(40px,8vw,80px) 32px", textAlign: "center", cursor: "pointer", transition: "all .15s", boxShadow: C.shadow }}
            >
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎵</div>
              <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700 }}>Drop your audio file here</h2>
              <p style={{ color: C.muted, margin: "0 0 24px", fontSize: 15 }}>MP3, WAV, M4A, AAC, FLAC, OGG, OPUS — any format works</p>
              <button style={{ background: C.primary, border: "none", color: "#fff", borderRadius: 10, padding: "11px 24px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Browse files</button>
              <input id="file-input" type="file" accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,.opus,audio/*" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          )}

          {/* ── Editor ── */}
          {file && (
            <>
              {/* Toolbar */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ color: C.dim, fontSize: 13, flex: "1 1 160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📄 {file.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 220px" }}>
                  <label style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>Save as:</label>
                  <input value={outputName} onChange={(e) => setOutputName(e.target.value)}
                    style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", color: C.text, fontSize: 13, flex: 1, minWidth: 0, outline: "none" }} />
                  <span style={{ fontSize: 12, color: C.dim }}>.mp3</span>
                </div>

                {/* Undo · Redo · Reset */}
                <button onClick={undo} disabled={!canUndo} title="Undo"
                  style={ghostBtn({ opacity: canUndo ? 1 : 0.35, cursor: canUndo ? "pointer" : "not-allowed" })}>↩ Undo</button>
                <button onClick={redo} disabled={!canRedo} title="Redo"
                  style={ghostBtn({ opacity: canRedo ? 1 : 0.35, cursor: canRedo ? "pointer" : "not-allowed" })}>↪ Redo</button>
                <button onClick={reset} title="Clear all cuts"
                  style={ghostBtn({ color: "#fca5a5", borderColor: "rgba(239,68,68,0.4)" })}>↺ Reset</button>

                <button onClick={() => document.getElementById("file-input-replace")?.click()} style={ghostBtn()}>Change file</button>
                <input id="file-input-replace" type="file" accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,.opus,audio/*" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>

              {/* Waveform card — expands to full viewport when fullscreen is active */}
              <div style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: fullscreen ? 0 : 14,
                padding: "16px 20px", boxShadow: C.shadow,
                ...(fullscreen ? {
                  position: "fixed", inset: 0, zIndex: 200,
                  display: "flex", flexDirection: "column",
                  borderRadius: 0,
                } : {}),
              }}>
                {/* Waveform header — 3 columns: label | time bar (centered) | fullscreen btn */}
                <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                  {/* Left: label */}
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: C.dim, textTransform: "uppercase", letterSpacing: "0.08em" }}>∿ WAVEFORM</span>

                  {/* Center: time bar — exact desktop style */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 12,
                    background: "rgba(0,0,0,.35)", border: `1px solid ${C.border}`,
                    borderRadius: 7, padding: "6px 14px",
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: C.dim, textTransform: "uppercase", letterSpacing: "0.09em" }}>+ Cursor</span>
                      <code style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: C.muted, letterSpacing: "0.02em" }}>
                        {cursorTime !== null ? fmt(cursorTime) : "—"}
                      </code>
                    </div>
                    <div style={{ width: 1, height: 28, background: C.border, flexShrink: 0 }} />
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: C.dim, textTransform: "uppercase", letterSpacing: "0.09em" }}>▶ Playhead</span>
                      <code style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: "#9d67f5", letterSpacing: "0.02em", textShadow: "0 0 12px rgba(124,58,237,.35)" }}>
                        {fmt(currentTime)}
                      </code>
                    </div>
                  </div>

                  {/* Right: fullscreen toggle */}
                  <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => setFullscreen((f) => !f)}
                      title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen waveform"}
                      style={{ background: "none", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 7, width: 30, height: 30, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, transition: "all .15s" }}
                    >
                      {fullscreen ? "⊠" : "⛶"}
                    </button>
                  </div>
                </div>

                {/* Minimap */}
                <div ref={minimapRef} style={{ borderRadius: 6, overflow: "hidden", background: C.surface, marginBottom: 6 }} />
                {/* Timeline */}
                <div ref={timelineRef} style={{ background: C.surface }} />
                {/* Waveform + hover cursor overlay */}
                <div
                  ref={waveWrapRef}
                  style={{ position: "relative", borderRadius: "0 0 8px 8px", overflow: "hidden", background: C.surface, cursor: "crosshair" }}
                  onMouseMove={(e) => {
                    if (!wsRef.current || !duration) return;
                    const rect = waveWrapRef.current!.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    let scrollLeft = 0, totalWidth = rect.width;
                    try {
                      const wrapper = wsRef.current.getWrapper();
                      if (wrapper) { scrollLeft = wrapper.scrollLeft; totalWidth = wrapper.scrollWidth; }
                    } catch { /* wrapper unavailable */ }
                    const progress = Math.max(0, Math.min(1, (mouseX + scrollLeft) / totalWidth));
                    setCursorTime(progress * duration);
                    const el = waveWrapRef.current!.querySelector(".ws-cursor") as HTMLDivElement | null;
                    const badge = waveWrapRef.current!.querySelector(".ws-badge") as HTMLDivElement | null;
                    if (el) { el.style.left = mouseX + "px"; el.style.opacity = "1"; }
                    if (badge) {
                      badge.style.opacity = "1";
                      badge.style.transform = mouseX > rect.width - 100 ? "translateX(calc(-100% - 10px))" : "translateX(8px)";
                    }
                  }}
                  onMouseLeave={() => {
                    setCursorTime(null);
                    const el = waveWrapRef.current?.querySelector(".ws-cursor") as HTMLDivElement | null;
                    const badge = waveWrapRef.current?.querySelector(".ws-badge") as HTMLDivElement | null;
                    if (el) el.style.opacity = "0";
                    if (badge) badge.style.opacity = "0";
                  }}
                >
                  <div ref={waveRef} style={fullscreen ? { flex: 1 } : {}} />
                  {/* Vertical cursor line */}
                  <div className="ws-cursor" style={{ position: "absolute", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.6)", pointerEvents: "none", opacity: 0, transition: "opacity .1s", zIndex: 10 }}>
                    <div className="ws-badge" style={{ position: "absolute", top: 8, background: "rgba(17,17,40,0.92)", border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 7px", fontSize: 11, fontFamily: "monospace", color: C.text, whiteSpace: "nowrap", pointerEvents: "none", opacity: 0, transition: "opacity .1s" }}>
                      {cursorTime !== null ? fmt(cursorTime) : ""}
                    </div>
                  </div>
                </div>

                <p style={{ margin: "8px 0 10px", fontSize: 11, color: "#334155", textAlign: "center" }}>
                  <strong style={{ color: C.dim }}>Drag</strong> on the waveform to mark a part to <strong style={{ color: C.error }}>cut</strong> · Drag edges to resize · <strong style={{ color: C.dim }}>Double-click</strong> a region to remove it
                </p>

                {/* Zoom — logarithmic, calibrated per-audio (same as desktop) */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, color: C.dim, cursor: "pointer", userSelect: "none" }}
                    onClick={() => setZoomSlider((s) => Math.max(0, s - 5))}>−</span>
                  <input type="range" min={0} max={100} value={zoomSlider}
                    onChange={(e) => setZoomSlider(Number(e.target.value))}
                    style={{ flex: 1, background: sliderBg(zoomSlider, 0, 100, "#7c3aed", "#06b6d4") }} />
                  <span style={{ fontSize: 14, color: C.dim, cursor: "pointer", userSelect: "none" }}
                    onClick={() => setZoomSlider((s) => Math.min(100, s + 5))}>+</span>
                  <button onClick={() => setZoomSlider(0)} style={ghostBtn({ fontSize: 11, padding: "3px 10px" })}>Fit</button>
                  {/* Zoom level badge — glows cyan when zoomed, matches desktop "2×" badge */}
                  <span style={{
                    background: zoomSlider > 0 ? "rgba(6,182,212,0.12)" : C.surface,
                    border: `1px solid ${zoomSlider > 0 ? C.accent : C.border}`,
                    color: zoomSlider > 0 ? C.accent : C.dim,
                    borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 700,
                    fontFamily: "monospace", whiteSpace: "nowrap", minWidth: 42, textAlign: "center",
                    transition: "all .15s",
                  }}>
                    {zoomSlider === 0 ? "Fit" : fmtZoom(sliderToZoom(zoomSlider, zoomMinRef.current))}
                  </span>
                </div>

                {/* Fullscreen regions panel — only shown inside the fullscreen card */}
                {fullscreen && (
                  <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 12, overflowY: "auto", maxHeight: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        Cut Regions <span style={{ color: "#334155", fontWeight: 400 }}>({regions.length})</span>
                      </span>
                      <span style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", borderRadius: 5, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>✂ CUT</span>
                      <span style={{ fontSize: 11, color: C.dim }}>Parts outside regions are kept.</span>
                    </div>
                    {regions.length === 0 ? (
                      <p style={{ color: "#334155", fontSize: 13, textAlign: "center", padding: "10px 0", margin: 0 }}>
                        No cuts yet — drag on the waveform to mark sections to remove.
                      </p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {regions.map((r) => (
                          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 12px", background: C.surface, borderRadius: 7, border: `1px solid ${C.border}` }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.error, flexShrink: 0 }} />
                            <span style={{ fontFamily: "monospace", fontSize: 13, flex: 1 }}>{fmt(r.start)} → {fmt(r.end)}</span>
                            <span style={{ fontSize: 12, color: C.dim }}>{(r.end - r.start).toFixed(1)}s</span>
                            <button onClick={() => removeRegion(r.id)}
                              style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 18, padding: "0 2px", lineHeight: 1 }}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Playback bar */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 20px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", boxShadow: C.shadow }}>
                {/* Transport */}
                <button onClick={skipBack}  style={iconBtn()} title="Skip back 5s">⏪</button>
                <button onClick={togglePlay} style={{ background: C.primary, border: "none", color: "#fff", borderRadius: "50%", width: 42, height: 42, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {isPlaying ? "⏸" : "▶"}
                </button>
                <button onClick={skipFwd}   style={iconBtn()} title="Skip forward 5s">⏩</button>

                {/* Seek */}
                <span style={{ fontFamily: "monospace", fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{fmt(currentTime)}</span>
                <input type="range" min={0} max={1000} value={seekPct} onChange={handleSeek}
                  style={{ flex: "1 1 80px", minWidth: 60, background: sliderBg(seekPct, 0, 1000, "#7c3aed", "#06b6d4") }} />
                <span style={{ fontFamily: "monospace", fontSize: 12, color: C.dim, whiteSpace: "nowrap" }}>{fmt(duration)}</span>

                {/* Volume */}
                <button onClick={() => setMuted((m) => !m)} style={{ background: "none", border: "none", color: muted ? C.error : C.muted, fontSize: 16, cursor: "pointer", padding: "0 2px" }}>
                  {muted ? "🔇" : volume < 0.4 ? "🔉" : "🔊"}
                </button>
                <input type="range" min={0} max={1} step={0.02} value={muted ? 0 : volume}
                  onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }}
                  style={{ width: 72, background: sliderBg(muted ? 0 : volume, 0, 1, "#7c3aed", "#a78bfa") }} />

                {/* Speed */}
                <span style={{ fontSize: 11, color: C.dim, whiteSpace: "nowrap" }}>Speed</span>
                <input type="range" min={0.5} max={2} step={0.1} value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  style={{ width: 72, background: sliderBg(speed, 0.5, 2, "#06b6d4", "#22d3ee") }} />
                <button onClick={() => setSpeed(1)}
                  style={{ background: speed !== 1 ? "rgba(6,182,212,0.12)" : C.surface, border: `1px solid ${speed !== 1 ? C.accent : C.border}`, color: speed !== 1 ? C.accent : C.dim, borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, fontFamily: "monospace", cursor: "pointer", transition: "all .15s", whiteSpace: "nowrap" }}>
                  {speed.toFixed(1)}×
                </button>

                {/* Mark to Cut */}
                <button onClick={markToCut} disabled={!file || duration === 0}
                  style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)", color: "#fca5a5", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                  ✂ Mark to Cut
                </button>

                {/* Preview */}
                <button onClick={handlePreview} disabled={isProcessing}
                  style={{ ...ghostBtn({ minWidth: 110, justifyContent: "center", position: "relative", overflow: "hidden" }) }}>
                  {previewing && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${previewProgress}%`, background: "rgba(124,58,237,0.2)", transition: "width .2s" }} />}
                  <span style={{ position: "relative" }}>{previewing ? `Building… ${previewProgress}%` : "▶ Preview"}</span>
                </button>

                {/* Export */}
                <button onClick={handleExport} disabled={isProcessing} style={primaryBtn({ minWidth: 140 })}>
                  {exporting && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${exportProgress}%`, background: "rgba(255,255,255,0.15)", transition: "width .2s" }} />}
                  <span style={{ position: "relative" }}>
                    {exporting ? `Exporting… ${exportProgress}%` : exportDone ? "✓ Exported!" : "⬇ Export MP3"}
                  </span>
                </button>
              </div>

              {/* Cut Regions */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, boxShadow: C.shadow }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.dim, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Cut Regions <span style={{ color: "#334155", fontWeight: 400 }}>({regions.length})</span>
                  </h3>
                  <span style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>✂ CUT</span>
                  <span style={{ fontSize: 11, color: C.dim }}>Highlighted regions = parts that will be deleted.</span>
                  <span style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#6ee7b7", borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>✓ KEPT</span>
                  <span style={{ fontSize: 11, color: C.dim }}>Everything <strong>outside</strong> the regions is saved.</span>
                </div>

                {regions.length === 0 ? (
                  <p style={{ color: "#334155", fontSize: 13, textAlign: "center", padding: "16px 0", margin: 0 }}>
                    No cuts yet. Drag on the waveform or click <strong style={{ color: "#fca5a5" }}>✂ Mark to Cut</strong> to select parts you want to remove.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {regions.map((r) => (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", background: C.surface, borderRadius: 8, border: `1px solid ${C.border}` }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.error, flexShrink: 0 }} />
                        <span style={{ fontFamily: "monospace", fontSize: 13, flex: 1 }}>{fmt(r.start)} → {fmt(r.end)}</span>
                        <span style={{ fontSize: 12, color: C.dim }}>{(r.end - r.start).toFixed(1)}s</span>
                        <button onClick={() => removeRegion(r.id)}
                          style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 18, padding: "0 2px", lineHeight: 1 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
