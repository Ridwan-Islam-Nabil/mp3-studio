/** Zoom controls under the waveform: − · log slider · + · Fit · level badge. */

import { fmtZoom, sliderToZoom } from "../editorUtils";
import { C, badge, ghostBtn, sliderBg } from "../theme";

interface Props {
  /** Slider position 0–100. */
  value: number;
  onChange: (updater: (s: number) => number) => void;
  /** Calibrated minimum px/sec (see useWaveSurfer). */
  zoomMin: number;
}

export const ZOOM_STEP = 5;

export function ZoomBar({ value, onChange, zoomMin }: Props) {
  const stepStyle: React.CSSProperties = { fontSize: 14, color: C.dim, cursor: "pointer", userSelect: "none" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={stepStyle} onClick={() => onChange((s) => Math.max(0, s - ZOOM_STEP))}>−</span>
      <input type="range" min={0} max={100} value={value} aria-label="Zoom"
        onChange={(e) => { const v = Number(e.target.value); onChange(() => v); }}
        style={{ flex: 1, background: sliderBg(value, 0, 100, "#7c3aed", "#06b6d4") }} />
      <span style={stepStyle} onClick={() => onChange((s) => Math.min(100, s + ZOOM_STEP))}>+</span>
      <button onClick={() => onChange(() => 0)} style={ghostBtn({ fontSize: 11, padding: "3px 10px" })}>Fit</button>
      {/* Level badge — glows cyan when zoomed */}
      <span style={badge(value > 0, { padding: "3px 9px", minWidth: 42, textAlign: "center" })}>
        {value === 0 ? "Fit" : fmtZoom(sliderToZoom(value, zoomMin))}
      </span>
    </div>
  );
}
