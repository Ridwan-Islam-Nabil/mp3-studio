/**
 * Pure editor helpers: time formatting, the logarithmic zoom scale, file metadata.
 * No React, no DOM — safe to unit-test in Node.
 */

/** File types the upload inputs accept. */
export const AUDIO_ACCEPT = ".mp3,.wav,.m4a,.aac,.ogg,.flac,.opus,audio/*";

/** Seconds → "m:ss.d" (e.g. 75.25 → "1:15.2"). Negative / non-finite → "0:00.0". */
export function fmt(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00.0";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${m}:${sec.toString().padStart(2, "0")}.${ms}`;
}

// ─── Zoom (logarithmic, calibrated per file — same idea as the local app) ────

/** px/sec ceiling of the zoom slider. */
export const ZOOM_MAX = 2000;

/**
 * Slider position 0–100 → px/sec on a log curve from `zoomMin` to ZOOM_MAX.
 * `zoomMin` is calibrated after audio loads (see calibrateZoomMin), so position 0 always
 * produces a visible zoom.
 */
export function sliderToZoom(s: number, zoomMin: number): number {
  const logMin = Math.log(zoomMin);
  const logMax = Math.log(ZOOM_MAX);
  return Math.round(Math.exp(logMin + (s / 100) * (logMax - logMin)));
}

/** Smallest useful zoom: just above the natural fit-to-view px/sec of the container. */
export function calibrateZoomMin(containerWidth: number, duration: number): number {
  return Math.max(1, Math.ceil(containerWidth / duration) + 1);
}

/** px/sec → badge text ("25×", "1.5k×"). */
export function fmtZoom(pxPerSec: number): string {
  if (pxPerSec >= 1000) return `${(pxPerSec / 1000).toFixed(1)}k×`;
  return `${pxPerSec}×`;
}

// ─── File metadata ───────────────────────────────────────────────────────────

/** Lower-case extension without the dot ("song.WAV" → "wav"), or "unknown". */
export function fileFormat(name: string | undefined): string {
  return name?.split(".").pop()?.toLowerCase() ?? "unknown";
}

/** Size in MB rounded to one decimal. */
export function fileSizeMb(size: number): number {
  return Math.round((size / 1024 / 1024) * 10) / 10;
}

/** Default output name: the file name without its extension, or "output". */
export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "") || "output";
}
