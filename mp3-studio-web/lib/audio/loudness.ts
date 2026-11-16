/**
 * lib/audio/loudness.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Fast (two-pass linear) normalization, the pure part: parse the integrated
 * loudness that FFmpeg's `ebur128` filter measured in pass 1 and turn it into
 * the gain that pass 2 applies. The arguments for both passes come from
 * ./args.ts (`buildLoudnessMeasureArgs`, `buildSegmentLoudnessMeasureArgs`,
 * `buildExportArgs(…, gainDb)`); lib/ffmpeg.ts runs them.
 *
 * Two sources, because one measure pass can hold several meters:
 *   - one meter (single-file export): the `Summary:` block ebur128 prints to
 *     the log when it closes → parseEbur128Summary();
 *   - one meter per segment (split export): each meter's running integrated
 *     loudness goes to its own text file via `ametadata=mode=print:file=…`
 *     → parseR128Metadata(). The log can't be used there: the summaries carry
 *     no reliable instance prefix (the wasm core drops it at some log levels)
 *     and are printed in filter-graph teardown order, not segment order.
 */

/** ebur128 reports this (or lower) when no block is above the -70 LUFS absolute gate: digital silence. */
export const SILENCE_LUFS = -70;

const NUM = String.raw`(-?(?:\d+(?:\.\d+)?|inf))`;
const SUMMARY_RE = /\bSummary:/;
const INTEGRATED_RE = new RegExp(String.raw`^\s*I:\s*${NUM}\s*LUFS`);
const META_RE = new RegExp(String.raw`lavfi\.r128\.I=${NUM}`, "g");

const toNumber = (s: string) => (s === "-inf" ? Number.NEGATIVE_INFINITY : s === "inf" ? Number.POSITIVE_INFINITY : Number(s));

/**
 * Integrated loudness (LUFS) from the LAST `Summary:` block of an ebur128 log,
 * or null if there is none:
 *
 *   [Parsed_ebur128_0 @ 0x…] Summary:      ← the prefix is missing in some wasm logs
 *
 *     Integrated loudness:
 *       I:         -28.0 LUFS
 *       Threshold: -38.1 LUFS
 *
 * The per-frame lines (`t: 1.2 … I: -28.0 LUFS …`) are ignored: they come
 * before the summary and their `I:` is not at the start of the line.
 * Accepts the log as one string or as separate lines. `-inf` → -Infinity.
 */
export function parseEbur128Summary(log: string | readonly string[]): number | null {
  const lines = (typeof log === "string" ? log : log.join("\n")).split(/\r?\n|\r/);
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (SUMMARY_RE.test(lines[i])) { start = i; break; }
  }
  if (start < 0) return null;
  for (let i = start + 1; i < lines.length; i++) {
    if (SUMMARY_RE.test(lines[i])) break;
    const m = INTEGRATED_RE.exec(lines[i]);
    if (m) return toNumber(m[1]);
  }
  return null;
}

/**
 * Integrated loudness (LUFS) from an `ametadata=mode=print:key=lavfi.r128.I`
 * file: the LAST value, which is the meter's reading at the end of the stream
 * (it matched the log summary to 0.05 LU in testing). Null if there is none
 * (e.g. an empty segment).
 *
 *   frame:599  pts:2875200 pts_time:59.9
 *   lavfi.r128.I=-29.054
 */
export function parseR128Metadata(text: string): number | null {
  let last: string | null = null;
  for (const m of text.matchAll(META_RE)) last = m[1];
  return last === null ? null : toNumber(last);
}

/**
 * Gain (dB) that moves `measuredLufs` to `targetLufs`. Returns 0 for silence
 * (≤ SILENCE_LUFS, -inf) or a non-finite measurement: there is nothing to
 * normalize, and boosting digital silence by 50+ dB would only raise noise.
 * Rounded to 0.01 dB.
 */
export function normalizeGainDb(measuredLufs: number, targetLufs: number): number {
  if (!Number.isFinite(measuredLufs) || measuredLufs <= SILENCE_LUFS + 0.05) return 0;
  return Math.round((targetLufs - measuredLufs) * 100) / 100;
}
