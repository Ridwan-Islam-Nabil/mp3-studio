/**
 * constants.js — shared configuration values.
 * No imports, no side-effects.
 */

/** Red/orange colour palette — regions mark parts to CUT (delete) */
export const REGION_PALETTE = [
  { bg: "rgba(239, 68,  68,  0.30)", border: "#ef4444" }, // red
  { bg: "rgba(249, 115, 22,  0.30)", border: "#f97316" }, // orange
  { bg: "rgba(234, 179, 8,   0.28)", border: "#eab308" }, // yellow
  { bg: "rgba(244, 63,  94,  0.30)", border: "#f43f5e" }, // rose
  { bg: "rgba(239, 68,  68,  0.22)", border: "#b91c1c" }, // dark red
  { bg: "rgba(249, 115, 22,  0.22)", border: "#c2410c" }, // dark orange
  { bg: "rgba(245, 158, 11,  0.25)", border: "#d97706" }, // amber
];

export const POLL_INTERVAL_MS = 700;   // download status poll cadence
export const SKIP_SECONDS     = 5;     // ← / → arrow skip amount
export const DEFAULT_REGION_W = 0.15;  // fraction of duration for auto-added cut region
