/**
 * Waveform card: header (label · cursor/playhead times · shortcuts + fullscreen buttons), minimap,
 * timeline, the WaveSurfer waveform with a hover cursor, hint text, zoom bar, and —
 * in fullscreen — whatever `fullscreenPanel` the parent passes (the compact region list).
 *
 * The container refs come from useWaveSurfer, which mounts WaveSurfer into them.
 */

import { useRef, useState, type ReactNode, type RefObject } from "react";
import type WaveSurfer from "wavesurfer.js";
import { fmt } from "../editorUtils";
import { C, sectionLabel } from "../theme";
import { ZoomBar } from "./ZoomBar";

interface Props {
  wsRef: RefObject<WaveSurfer | null>;
  waveRef: RefObject<HTMLDivElement | null>;
  minimapRef: RefObject<HTMLDivElement | null>;
  timelineRef: RefObject<HTMLDivElement | null>;
  duration: number;
  currentTime: number;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onShowShortcuts: () => void;
  zoomSlider: number;
  onZoomChange: (updater: (s: number) => number) => void;
  zoomMin: number;
  fullscreenPanel?: ReactNode;
  /** Shown next to the "WAVEFORM" label (the cut / keep mode badge). */
  headerBadge?: ReactNode;
  /** Region mode, for the hint under the waveform. */
  mode?: "cut" | "keep";
}

const timeLabel: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: C.dim, textTransform: "uppercase", letterSpacing: "0.09em" };
const headerBtn: React.CSSProperties = { background: "none", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 7, width: 30, height: 30, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, transition: "all .15s" };
const timeValue: React.CSSProperties ={ fontFamily: "monospace", fontSize: 13, fontWeight: 600, letterSpacing: "0.02em" };

export function WaveformCard({
  wsRef, waveRef, minimapRef, timelineRef, duration, currentTime,
  fullscreen, onToggleFullscreen, onShowShortcuts, zoomSlider, onZoomChange, zoomMin, fullscreenPanel,
  headerBadge, mode = "cut",
}: Props) {
  const [cursorTime, setCursorTime] = useState<number | null>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const badgeRef  = useRef<HTMLDivElement>(null);

  // The hover line/badge are positioned imperatively (no re-render per pixel of movement).
  const onMouseMove = (e: React.MouseEvent) => {
    const wrap = wrapRef.current;
    if (!wsRef.current || !duration || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    let scrollLeft = 0, totalWidth = rect.width;
    try {
      const wrapper = wsRef.current.getWrapper();
      if (wrapper) { scrollLeft = wrapper.scrollLeft; totalWidth = wrapper.scrollWidth; }
    } catch { /* wrapper unavailable */ }
    const progress = Math.max(0, Math.min(1, (mouseX + scrollLeft) / totalWidth));
    setCursorTime(progress * duration);
    if (cursorRef.current) { cursorRef.current.style.left = mouseX + "px"; cursorRef.current.style.opacity = "1"; }
    if (badgeRef.current) {
      badgeRef.current.style.opacity = "1";
      badgeRef.current.style.transform = mouseX > rect.width - 100 ? "translateX(calc(-100% - 10px))" : "translateX(8px)";
    }
  };

  const onMouseLeave = () => {
    setCursorTime(null);
    if (cursorRef.current) cursorRef.current.style.opacity = "0";
    if (badgeRef.current) badgeRef.current.style.opacity = "0";
  };

  return (
    <div data-testid="waveform-card" style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: fullscreen ? 0 : 14,
      padding: "16px 20px", boxShadow: C.shadow,
      ...(fullscreen ? { position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", borderRadius: 0 } : {}),
    }}>
      {/* Header — label | time bar (centered) | fullscreen button */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
          <span style={sectionLabel({ letterSpacing: "0.08em" })}>∿ WAVEFORM</span>
          {headerBadge}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(0,0,0,.35)", border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 14px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
            <span style={timeLabel}>+ Cursor</span>
            <code style={{ ...timeValue, color: C.muted }}>{cursorTime !== null ? fmt(cursorTime) : "—"}</code>
          </div>
          <div style={{ width: 1, height: 28, background: C.border, flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
            <span style={timeLabel}>▶ Playhead</span>
            <code style={{ ...timeValue, color: "#9d67f5", textShadow: "0 0 12px rgba(124,58,237,.35)" }}>{fmt(currentTime)}</code>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", gap: 6 }}>
          <button
            onClick={onShowShortcuts}
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
            style={headerBtn}
          >
            ⌨
          </button>
          <button
            onClick={onToggleFullscreen}
            title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen waveform (F)"}
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen waveform"}
            style={headerBtn}
          >
            {fullscreen ? "⊠" : "⛶"}
          </button>
        </div>
      </div>

      <div ref={minimapRef} style={{ borderRadius: 6, overflow: "hidden", background: C.surface, marginBottom: 6 }} />
      <div ref={timelineRef} style={{ background: C.surface }} />

      {/* Waveform + hover cursor overlay. data-testid is used by the e2e smoke test. */}
      <div
        ref={wrapRef}
        data-testid="waveform"
        style={{ position: "relative", borderRadius: "0 0 8px 8px", overflow: "hidden", background: C.surface, cursor: "crosshair" }}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        <div ref={waveRef} style={fullscreen ? { flex: 1 } : {}} />
        <div ref={cursorRef} style={{ position: "absolute", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.6)", pointerEvents: "none", opacity: 0, transition: "opacity .1s", zIndex: 10 }}>
          <div ref={badgeRef} style={{ position: "absolute", top: 8, background: "rgba(17,17,40,0.92)", border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 7px", fontSize: 11, fontFamily: "monospace", color: C.text, whiteSpace: "nowrap", pointerEvents: "none", opacity: 0, transition: "opacity .1s" }}>
            {cursorTime !== null ? fmt(cursorTime) : ""}
          </div>
        </div>
      </div>

      <p style={{ margin: "8px 0 10px", fontSize: 11, color: C.faint, textAlign: "center" }}>
        <strong style={{ color: C.dim }}>Drag</strong> on the waveform to mark a part to{" "}
        {mode === "keep"
          ? <strong style={{ color: C.success }}>keep</strong>
          : <strong style={{ color: C.error }}>cut</strong>} · Drag edges to resize · <strong style={{ color: C.dim }}>Double-click</strong> a region to remove it
      </p>

      <ZoomBar value={zoomSlider} onChange={onZoomChange} zoomMin={zoomMin} />

      {fullscreen && fullscreenPanel}
    </div>
  );
}
