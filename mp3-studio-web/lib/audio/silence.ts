/**
 * lib/audio/silence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * "Remove silence": pure parsing of FFmpeg's `silencedetect` log and conversion
 * of the detected silences into cut regions. The FFmpeg run itself is
 * `detectSilence()` in lib/ffmpeg.ts; its arguments come from
 * `buildSilenceDetectArgs()` in ./args.ts.
 */

import { mergeRegions, type CutRegion } from "./regions";

export interface SilenceOptions {
  /** Anything quieter than this (dBFS) counts as silence. Default -40. */
  thresholdDb?: number;
  /** Only silences at least this long (seconds) are reported. Default 0.7. */
  minSilenceSec?: number;
  /**
   * Seconds of silence kept on each side of the remaining audio so speech isn't
   * clipped (not applied at the very start/end of the file). Default 0.15.
   */
  paddingSec?: number;
}

export const DEFAULT_SILENCE_OPTIONS: Readonly<Required<SilenceOptions>> = {
  thresholdDb: -40,
  minSilenceSec: 0.7,
  paddingSec: 0.15,
};

/** A silent stretch as reported by silencedetect (before padding). */
export interface SilenceInterval {
  start: number;
  end: number;
}

/** Cuts shorter than this after padding are dropped. */
const MIN_CUT_SEC = 0.05;
/**
 * A silence within this distance of the file start/end touches it. Generous
 * because the caller's duration (e.g. from the browser's decoder) can differ
 * from FFmpeg's decoded length by a few tens of ms (MP3 encoder delay).
 */
const EDGE_SEC = 0.05;

const NUM = String.raw`(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)`;
const START_RE = new RegExp(String.raw`silence_start:\s*${NUM}`, "i");
const END_RE = new RegExp(String.raw`silence_end:\s*${NUM}`, "i");

/**
 * Extracts silent intervals from silencedetect log output:
 *   [silencedetect @ 0x…] silence_start: 30.0217
 *   [silencedetect @ 0x…] silence_end: 33.0184 | silence_duration: 2.9967
 *
 * - Accepts the log as one string or as separate lines.
 * - A trailing `silence_start` with no `silence_end` (silence running to EOF;
 *   older FFmpeg builds don't print a final end) is closed at `duration` when
 *   given, otherwise dropped.
 * - Negative starts (silencedetect can report e.g. -0.0013 at the file start)
 *   are clamped to 0; results are clamped to `duration` when given.
 */
export function parseSilenceLog(log: string | readonly string[], duration?: number): SilenceInterval[] {
  const lines = (typeof log === "string" ? log : log.join("\n")).split(/\r?\n|\r/);
  const out: SilenceInterval[] = [];
  let open: number | null = null;
  const clamp = (t: number) => Math.max(0, duration !== undefined ? Math.min(duration, t) : t);

  for (const line of lines) {
    const s = START_RE.exec(line);
    if (s) {
      open = clamp(Number(s[1]));
      continue;
    }
    const e = END_RE.exec(line);
    if (e && open !== null) {
      const end = clamp(Number(e[1]));
      if (end > open) out.push({ start: open, end });
      open = null;
    }
  }
  if (open !== null && duration !== undefined && duration > open) out.push({ start: open, end: duration });
  return out;
}

/**
 * Turns detected silences into cut regions, keeping `paddingSec` of silence
 * next to the remaining audio. A silence touching the file start/end is cut all
 * the way to the edge (no padding there). Cuts that end up shorter than 50 ms
 * are dropped; the rest are merged and clamped to [0, duration].
 */
export function silencesToCuts(
  silences: readonly SilenceInterval[],
  duration: number,
  paddingSec: number = DEFAULT_SILENCE_OPTIONS.paddingSec
): CutRegion[] {
  const pad = Math.max(0, paddingSec);
  const cuts = silences
    .map((s) => ({
      start: s.start <= EDGE_SEC ? 0 : s.start + pad,
      end: s.end >= duration - EDGE_SEC ? duration : s.end - pad,
    }))
    .filter((c) => c.end - c.start >= MIN_CUT_SEC);
  return mergeRegions(cuts, duration);
}
