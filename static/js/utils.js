/**
 * utils.js — pure formatting and parsing helpers.
 * No imports, no DOM, no state.
 */

/** Format seconds as "M:SS" or "H:MM:SS" (whole seconds, no decimals) */
export function _fmtTime(s) {
  if (!isFinite(s) || s < 0) return "0:00";
  s = Math.floor(s);
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${_z(m)}:${_z(sec)}`;
  return `${m}:${_z(sec)}`;
}

/** Format seconds as "M:SS.mmm" (millisecond precision) */
export function _fmtTimeMs(s) {
  if (!isFinite(s) || s < 0) return "0:00.000";
  const h     = Math.floor(s / 3600);
  const m     = Math.floor((s % 3600) / 60);
  const sec   = Math.floor(s % 60);
  const ms    = Math.round((s - Math.floor(s)) * 1000);
  const msStr = String(ms).padStart(3, "0");
  if (h > 0) return `${h}:${_z(m)}:${_z(sec)}.${msStr}`;
  return `${m}:${_z(sec)}.${msStr}`;
}

/** Zero-pad a number to 2 digits */
export function _z(n) { return String(n).padStart(2, "0"); }

/** Parse "M:SS", "H:MM:SS", or a bare-seconds string → float seconds */
export function _parseTime(str) {
  str = str.trim();
  if (/^\d+(\.\d+)?$/.test(str)) return parseFloat(str);
  const parts = str.split(":").map(Number);
  if (parts.some(isNaN)) return NaN;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return NaN;
}

/** Pick a readable waveform timeline tick interval for a given duration */
export function _niceInterval(dur) {
  if (dur <= 60)   return 5;
  if (dur <= 300)  return 30;
  if (dur <= 600)  return 60;
  if (dur <= 3600) return 300;
  return 600;
}

/** Minimal HTML-escaping for untrusted strings in innerHTML */
export function escHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Human-readable byte size */
export function _fmtSize(bytes) {
  if (bytes < 1024)          return bytes + " B";
  if (bytes < 1024 * 1024)   return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

/** Lowercase file extension including the dot, e.g. ".mp3" */
export function ext(filename) {
  return "." + filename.split(".").pop().toLowerCase();
}
