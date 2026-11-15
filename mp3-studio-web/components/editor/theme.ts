/**
 * Editor design tokens and shared inline-style helpers.
 *
 * Palette matches the local Flask app's style.css:
 *   --bg #06060f · --surface #0d0d1c · --card #111128 · --card-border #1e1e40
 *   --primary #7c3aed (purple) · --accent #06b6d4 (cyan)
 * Waveform gradient: ["#7c3aed","#1d4ed8"] → progress ["#a78bfa","#60a5fa"].
 *
 * The editor uses inline styles (not Tailwind) so it looks identical to the local app.
 */

import type { CSSProperties } from "react";

export const C = {
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
  faint:      "#334155",
  cutText:    "#fca5a5",
  shadow:     "0 4px 32px rgba(0,0,0,.55)",
} as const;

/** Random translucent red for a new cut region. */
const CUT_COLORS = [
  "rgba(239,68,68,0.3)",
  "rgba(220,38,38,0.3)",
  "rgba(248,113,113,0.28)",
];
export const cutColor = () => CUT_COLORS[Math.floor(Math.random() * CUT_COLORS.length)];

// ─── Buttons ─────────────────────────────────────────────────────────────────

export const ghostBtn = (extra?: CSSProperties): CSSProperties => ({
  background: "transparent", border: `1px solid ${C.border}`, color: C.muted,
  borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600,
  cursor: "pointer", transition: "all .15s", display: "inline-flex", alignItems: "center", gap: 5,
  ...extra,
});

export const primaryBtn = (extra?: CSSProperties): CSSProperties => ({
  background: C.primary, border: "none", color: "#fff",
  borderRadius: 8, padding: "7px 20px", fontSize: 13, fontWeight: 700,
  cursor: "pointer", position: "relative", overflow: "hidden",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  ...extra,
});

export const iconBtn = (extra?: CSSProperties): CSSProperties => ({
  background: "transparent", border: `1px solid ${C.border}`, color: C.muted,
  borderRadius: 8, padding: "7px 11px", fontSize: 16,
  cursor: "pointer", transition: "all .15s", ...extra,
});

/** Small monospace badge that glows cyan when `active` (zoom level, playback speed). */
export const badge = (active: boolean, extra?: CSSProperties): CSSProperties => ({
  background: active ? "rgba(6,182,212,0.12)" : C.surface,
  border: `1px solid ${active ? C.accent : C.border}`,
  color: active ? C.accent : C.dim,
  borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: "monospace",
  whiteSpace: "nowrap", transition: "all .15s",
  ...extra,
});

/** Card container used by the playback bar and the region list. */
export const card = (extra?: CSSProperties): CSSProperties => ({
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: C.shadow,
  ...extra,
});

/** "Save as" text input. */
export const textInput = (extra?: CSSProperties): CSSProperties => ({
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px",
  color: C.text, fontSize: 13, flex: 1, outline: "none",
  ...extra,
});

/** Small uppercase section label ("∿ WAVEFORM", "Cut Regions"). */
export const sectionLabel = (extra?: CSSProperties): CSSProperties => ({
  fontSize: 11, fontWeight: 700, color: C.dim, textTransform: "uppercase", letterSpacing: "0.06em",
  ...extra,
});

/**
 * Background for a range input: the filled part (left of the thumb) is a gradient, the rest
 * is faint. Same technique as the local app's updateZoomUI().
 */
export function sliderBg(value: number, min: number, max: number, c1: string, c2: string): string {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return `linear-gradient(90deg, ${c1} 0%, ${c2} ${pct}%, rgba(255,255,255,.12) ${pct}%, rgba(255,255,255,.12) 100%)`;
}
