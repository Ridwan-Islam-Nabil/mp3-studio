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

// ─── Typed-in times (region list) ────────────────────────────────────────────

/**
 * Seconds → "M:SS.mmm", or "H:MM:SS.mmm" from one hour on (e.g. 75.25 → "1:15.250").
 * Used as the starting text of the region time editor. Negative / non-finite → "0:00.000".
 */
export function fmtPrecise(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00.000";
  const totalMs = Math.round(s * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const sec = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const tail = `${sec.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
  if (totalMin < 60) return `${totalMin}:${tail}`;
  const h = Math.floor(totalMin / 60);
  return `${h}:${(totalMin % 60).toString().padStart(2, "0")}:${tail}`;
}

const SECONDS_RE = /^\d+(\.\d*)?$|^\.\d+$/;
const INT_RE = /^\d+$/;

/**
 * Parses a typed time: "SS.mmm", "M:SS.mmm" or "H:MM:SS.mmm" (fraction optional, any number of
 * decimals). With a minutes field the seconds must be < 60; with an hours field the minutes
 * must be < 60 too. Returns seconds, or null if the text is not a valid time.
 */
export function parseTime(text: string): number | null {
  const parts = text.trim().split(":");
  if (parts.length > 3 || parts.some((p) => p === "")) return null;
  const secPart = parts[parts.length - 1];
  if (!SECONDS_RE.test(secPart)) return null;
  const sec = Number(secPart);
  const ints = parts.slice(0, -1);
  if (!ints.every((p) => INT_RE.test(p))) return null;
  if (ints.length >= 1 && sec >= 60) return null;
  const [h, m] = ints.length === 2 ? [Number(ints[0]), Number(ints[1])] : [0, Number(ints[0] ?? 0)];
  if (ints.length === 2 && m >= 60) return null;
  const total = h * 3600 + m * 60 + sec;
  return isFinite(total) ? total : null;
}

/** Shortest cut a typed edit may produce, in seconds. */
export const MIN_CUT_SECONDS = 0.01;

export type TimeEditResult = { start: number; end: number } | { error: string };

/**
 * Applies a typed start or end time to a region: clamps it to [0, duration], then requires
 * start < end (by at least MIN_CUT_SECONDS). Times are rounded to the millisecond.
 */
export function resolveTimeEdit(
  region: { start: number; end: number },
  which: "start" | "end",
  value: number,
  duration: number,
): TimeEditResult {
  if (!isFinite(value)) return { error: "Not a valid time." };
  const clamped = Math.round(Math.min(Math.max(value, 0), duration) * 1000) / 1000;
  const start = which === "start" ? clamped : region.start;
  const end   = which === "end"   ? clamped : region.end;
  // Compare in whole milliseconds so float noise (10.01 - 10 = 0.00999…) doesn't reject a valid edit.
  if (Math.round((end - start) * 1000) < Math.round(MIN_CUT_SECONDS * 1000)) {
    return { error: which === "start" ? "Start must be before the end." : "End must be after the start." };
  }
  return { start, end };
}
