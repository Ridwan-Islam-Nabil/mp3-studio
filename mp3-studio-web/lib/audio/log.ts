/**
 * lib/audio/log.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure parsers for FFmpeg's text log (what @ffmpeg/ffmpeg emits as "log" events,
 * one line per event).
 */

function hms(h: string, m: string, s: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

/** Parses the `time=HH:MM:SS.xx` field of a stats line. `null` if absent or `N/A`. */
export function parseLogTime(line: string): number | null {
  const m = /time=\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(line);
  return m ? hms(m[1], m[2], m[3]) : null;
}

/**
 * Parses the input header's `Duration: HH:MM:SS.xx` (the first one in `log`).
 * `null` if absent or `N/A`.
 */
export function parseInputDuration(log: string): number | null {
  const m = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(log);
  return m ? hms(m[1], m[2], m[3]) : null;
}

/** Lines that look like the reason for a failed run (for error messages). */
export function errorLines(lines: readonly string[], max = 3): string[] {
  return lines.filter((l) => /error|invalid|failed|cannot|unable|no such/i.test(l)).slice(-max);
}
