/**
 * lib/audio/args.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure FFmpeg argument builders (no FFmpeg instance, no DOM) — the part of the
 * engine that decides WHAT FFmpeg runs. lib/ffmpeg.ts runs them.
 *
 * WHY A SINGLE FILTER GRAPH (instead of cutting seg_N.mp3 files and joining
 * them with the concat demuxer + `-c copy`, which this app used to do):
 *   - Input-seeking (`-ss` before `-i`) into an MP3 decoded the first ~100 ms
 *     after every seek as silence, so each join had an audible dropout.
 *   - Copy-concatenating MP3s keeps every segment's encoder delay/padding
 *     (~25–50 ms of near-silence per segment) and produces non-monotonic DTS.
 *   - Hard cuts at arbitrary sample positions click.
 *   Decoding once and trimming with `atrim` is sample-accurate, a short
 *   fade-out/fade-in at each interior join removes the click, and the audio is
 *   encoded exactly once. The file's very start and end are never faded
 *   (unless the caller asks for `fade`).
 *
 * Graph shape for one export (each step only when needed):
 *   [0:a:0] atrim → asetpts → join fades   (one chain per kept segment)
 *        → concat → normalize → asetpts → afade in → afade out → [out]
 * where normalize is `volume` → oversampled `alimiter` in the default fast
 * mode (gain measured by a first pass of the same atrim/concat graph into
 * `ebur128`), or single-pass `loudnorm`. See NormalizeMode.
 */

import { DEFAULT_FORMAT, OUTPUT_SAMPLE_RATE, encoderArgs, type EncoderOptions, type OutputFormat } from "./formats";
import { totalLength, type KeepSegment } from "./regions";

/** Fade length applied on each side of an interior join / cut edge (seconds). */
export const JOIN_FADE_SEC = 0.012;

/** Edges closer than this to the file start/end are treated as the start/end. */
export const EDGE_EPSILON_SEC = 0.01;

/**
 * Loudness target for `normalize`: -16 LUFS integrated, -1.5 dBTP true peak,
 * LRA 11 (LRA is used by `loudnorm` only) — the common target for podcasts /
 * streaming on mobile. Both normalize modes aim for it.
 */
export const LOUDNORM_TARGET = { integratedLufs: -16, truePeakDb: -1.5, lra: 11 } as const;

/**
 * Fast normalize: the limiter's ceiling (dBFS, sample peak at the oversampled
 * rate). 0.5 dB below LOUDNORM_TARGET.truePeakDb leaves room for the overshoot
 * that downsampling and the lossy encoder add. Measured on MP3 output: about
 * -1.9 dBTP with light limiting, still ≤ -1.0 dBTP with 6 dB of gain reduction.
 */
export const LIMITER_CEILING_DB = -2;

/**
 * Fast normalize: the limiter runs at twice the output rate so it also catches
 * most inter-sample (true) peaks. 2× gave almost the same true peak as 4× for
 * less than half the extra time (+0.5 s vs +1.3 s for a 3-minute file in the
 * browser); without oversampling, heavy limiting overshot to -0.4 dBTP.
 */
export const LIMITER_OVERSAMPLE_RATE = 2 * OUTPUT_SAMPLE_RATE;

/**
 * How `normalize` reaches LOUDNORM_TARGET:
 * - `"fast"` (also `true`): two passes. Pass 1 measures the integrated loudness
 *   of exactly what will be exported (the same atrim/concat graph into
 *   `ebur128`, `-f null`); pass 2 applies one constant gain (`volume`) and an
 *   oversampled peak limiter (`alimiter`). Keeps the dynamics; ~2.5 s instead
 *   of ~9–13 s for a 3-minute file in the browser.
 * - `"loudnorm"`: one pass of FFmpeg's `loudnorm` in dynamic mode. Rides the
 *   gain over time (and pulls the loudness range towards LRA 11), but
 *   upsamples to 192 kHz internally, which is what makes it slow.
 */
export type NormalizeMode = "fast" | "loudnorm";

export interface FadeOptions {
  /** Fade-in length at the very start of the output file (seconds). */
  inSec?: number;
  /** Fade-out length at the very end of the output file (seconds). */
  outSec?: number;
}

export interface ExportOptions extends EncoderOptions {
  /** Output format. Default 'mp3'. */
  format?: OutputFormat;
  /**
   * Loudness-normalize the output to LOUDNORM_TARGET: `true` or `"fast"` =
   * two-pass linear gain + limiter, `"loudnorm"` = single-pass loudnorm.
   * See NormalizeMode. Default: off.
   */
  normalize?: boolean | NormalizeMode;
  /**
   * Fades at the start/end of the output file (ringtones). Applied after
   * normalization. If inSec + outSec exceed the output length they are scaled
   * down proportionally.
   */
  fade?: FadeOptions;
}

const f6 = (n: number) => n.toFixed(6);

/** The normalize mode `options.normalize` asks for, or null when it is off. */
export function normalizeMode(normalize: ExportOptions["normalize"]): NormalizeMode | null {
  if (normalize === "loudnorm") return "loudnorm";
  return normalize ? "fast" : null;
}

/** `loudnorm` filter string for LOUDNORM_TARGET. */
export function loudnormFilter(): string {
  const t = LOUDNORM_TARGET;
  return `loudnorm=I=${t.integratedLufs}:TP=${t.truePeakDb}:LRA=${t.lra}`;
}

/**
 * Fast normalize, pass 2: constant gain, then a peak limiter at
 * LIMITER_CEILING_DB running at LIMITER_OVERSAMPLE_RATE, back to the output rate.
 * `level=disabled` turns off alimiter's auto-level (on by default in this
 * FFmpeg; it would scale the output back up to 0 dBFS); `latency=1`
 * compensates the 5 ms look-ahead so the audio isn't shifted or cut short.
 */
export function linearGainFilters(gainDb: number): string[] {
  if (!Number.isFinite(gainDb)) throw new Error(`linearGainFilters: invalid gain ${gainDb}`);
  const limit = Math.pow(10, LIMITER_CEILING_DB / 20);
  return [
    `volume=${gainDb.toFixed(2)}dB`,
    `aresample=${LIMITER_OVERSAMPLE_RATE}`,
    `alimiter=limit=${f6(limit)}:level=disabled:latency=1`,
    `aresample=${OUTPUT_SAMPLE_RATE}`,
  ];
}

/**
 * Fast normalize, pass 1 meter for a single output: prints only the summary
 * (parseEbur128Summary), not 10 lines per second.
 */
export const EBUR128_MEASURE_FILTER = "ebur128=framelog=verbose";

/**
 * Fast normalize, pass 1 meter for one of several outputs: writes the running
 * integrated loudness to `fileName` in the virtual FS (parseR128Metadata).
 */
export function ebur128MetadataFilters(fileName: string): string[] {
  if (!/^[\w.-]+$/.test(fileName)) throw new Error(`ebur128MetadataFilters: unsafe file name "${fileName}"`);
  return ["ebur128=metadata=1:framelog=verbose", `ametadata=mode=print:key=lavfi.r128.I:file=${fileName}`];
}

/**
 * Filters applied to a finished output stream of `outputSec` seconds:
 * loudness normalization, then the start/end fades.
 *
 * `gainDb` is the gain from the fast-normalize measure pass; required when the
 * mode is `"fast"`, ignored otherwise.
 */
export function outputFilters(
  outputSec: number,
  options: Pick<ExportOptions, "normalize" | "fade"> = {},
  gainDb?: number
): string[] {
  const filters: string[] = [];
  const mode = normalizeMode(options.normalize);
  if (mode === "loudnorm") {
    filters.push(loudnormFilter());
  } else if (mode === "fast") {
    if (gainDb === undefined) throw new Error("Fast normalize needs the measured gain: run the loudness measure pass first.");
    filters.push(...linearGainFilters(gainDb));
  }

  let fadeIn = Math.max(0, options.fade?.inSec ?? 0);
  let fadeOut = Math.max(0, options.fade?.outSec ?? 0);
  if (!Number.isFinite(fadeIn)) fadeIn = 0;
  if (!Number.isFinite(fadeOut)) fadeOut = 0;
  const total = fadeIn + fadeOut;
  if (total > outputSec && total > 0) {
    fadeIn *= outputSec / total;
    fadeOut *= outputSec / total;
  }
  if (fadeIn > 0 || fadeOut > 0) {
    // afade's `st` is in stream time; make sure the stream starts at 0
    // (an untrimmed MP3 starts at ~0.025 s because of the encoder delay).
    filters.push("asetpts=PTS-STARTPTS");
    if (fadeIn > 0) filters.push(`afade=t=in:st=0:d=${f6(fadeIn)}`);
    if (fadeOut > 0) filters.push(`afade=t=out:st=${f6(outputSec - fadeOut)}:d=${f6(fadeOut)}`);
  }
  return filters;
}

/**
 * Trim (+ optional short de-click fades) for one segment of the source.
 * Edges at 0 / `duration` are left open so the output runs to the true
 * start/end of the stream even if the browser-reported duration is slightly off.
 */
export function segmentFilters(
  seg: KeepSegment,
  duration: number,
  fades: { in: boolean; out: boolean }
): string[] {
  const filters: string[] = [];
  const trim: string[] = [];
  if (seg.start > EDGE_EPSILON_SEC) trim.push(`start=${f6(seg.start)}`);
  if (seg.end < duration - EDGE_EPSILON_SEC) trim.push(`end=${f6(seg.end)}`);
  if (trim.length) filters.push(`atrim=${trim.join(":")}`, "asetpts=PTS-STARTPTS");

  // Never longer than half the segment so the two fades can't overlap.
  const segDur = seg.end - seg.start;
  const fade = Math.min(JOIN_FADE_SEC, segDur / 2);
  if (fade > 0) {
    if (fades.in) filters.push(`afade=t=in:st=0:d=${f6(fade)}`);
    if (fades.out) filters.push(`afade=t=out:st=${f6(segDur - fade)}:d=${f6(fade)}`);
  }
  return filters;
}

function assertKeep(keep: KeepSegment[]): void {
  if (keep.length === 0) throw new Error("Nothing to export — every part of the audio is cut.");
}

/** Per-segment chains of a joined export: de-click fades at interior joins only. */
function joinedChains(keep: KeepSegment[], duration: number): string[][] {
  const n = keep.length;
  return keep.map((seg, i) => segmentFilters(seg, duration, { in: n > 1 && i > 0, out: n > 1 && i < n - 1 }));
}

/** `-filter_complex` value: segment chains → concat (if several) → `post` → [out]. */
function joinedGraph(chains: string[][], post: string[]): string {
  if (chains.length === 1) return `[0:a:0]${[...chains[0], ...post].join(",") || "anull"}[out]`;
  const parts = chains.map((f, i) => `[0:a:0]${f.length ? f.join(",") : "anull"}[s${i}]`);
  const inputs = chains.map((_, i) => `[s${i}]`).join("");
  parts.push(`${inputs}${[`concat=n=${chains.length}:v=0:a=1`, ...post].join(",")}[out]`);
  return parts.join(";");
}

/**
 * Per-segment chains of a split export: de-click fades at every edge that was a
 * cut point (not at the source's own start/end).
 */
function splitChain(seg: KeepSegment, duration: number): string[] {
  return segmentFilters(seg, duration, {
    in: seg.start > EDGE_EPSILON_SEC,
    out: seg.end < duration - EDGE_EPSILON_SEC,
  });
}

/**
 * Builds the FFmpeg arguments for one export pass: kept segments → one output
 * file in `options.format` (default MP3). See the module comment for why it is
 * a single filter graph.
 *
 * `gainDb`: the fast-normalize gain from the measure pass
 * (buildLoudnessMeasureArgs → parseEbur128Summary → normalizeGainDb). Required
 * when `normalizeMode(options.normalize) === "fast"`.
 *
 * With zero cuts and no output filters there is no graph at all (`-map 0:a:0`).
 */
export function buildExportArgs(
  inputName: string,
  keep: KeepSegment[],
  duration: number,
  outputName: string,
  options: ExportOptions = {},
  gainDb?: number
): string[] {
  assertKeep(keep);
  const chains = joinedChains(keep, duration);
  const post = outputFilters(totalLength(keep), options, gainDb);

  const args = ["-i", inputName];
  if (chains.length === 1 && chains[0].length === 0 && post.length === 0) {
    // Zero cuts, nothing to apply: whole stream, no filter graph needed.
    args.push("-map", "0:a:0");
  } else {
    args.push("-filter_complex", joinedGraph(chains, post), "-map", "[out]");
  }

  args.push(...encoderArgs(options.format ?? DEFAULT_FORMAT, options), "-y", outputName);
  return args;
}

/**
 * Fast normalize, pass 1 for buildExportArgs: the same kept segments, join
 * fades and concat, into `ebur128` and the null muxer (nothing is encoded).
 * The output fades are not part of it: normalization comes before them.
 * Read the result with parseEbur128Summary(log).
 */
export function buildLoudnessMeasureArgs(inputName: string, keep: KeepSegment[], duration: number): string[] {
  assertKeep(keep);
  return [
    "-i", inputName,
    "-filter_complex", joinedGraph(joinedChains(keep, duration), [EBUR128_MEASURE_FILTER]),
    "-map", "[out]", "-f", "null", "-",
  ];
}

/**
 * The first output of the split-export runs: a stream copy of the input into
 * the null muxer. It costs almost nothing, keeps the demuxer reading to the
 * end, and makes the stats line's `time=` follow the INPUT position, which is
 * what progress needs (the per-segment outputs' times jump around).
 */
const INPUT_PROGRESS_OUTPUT = ["-map", "0:a:0", "-c", "copy", "-f", "null", "-"];

/**
 * Builds ONE FFmpeg run that writes every kept segment to its own file
 * (`outputNames[i]` for `keep[i]`). The input is decoded once and split inside
 * the filter graph, which is much faster than one run per segment (each of
 * those would decode the source from the beginning to reach its `atrim`).
 *
 * Each file gets a 12 ms de-click fade at edges that were cut points (not at the
 * source's own start/end), then `normalize` / `fade` per file. In fast-normalize
 * mode `gainsDb[i]` is segment i's measured gain
 * (buildSegmentLoudnessMeasureArgs → parseR128Metadata → normalizeGainDb).
 */
export function buildSegmentExportArgs(
  inputName: string,
  keep: KeepSegment[],
  duration: number,
  outputNames: string[],
  options: ExportOptions = {},
  gainsDb?: readonly number[]
): string[] {
  assertKeep(keep);
  if (outputNames.length !== keep.length) throw new Error("buildSegmentExportArgs: need one output name per segment.");
  if (gainsDb && gainsDb.length !== keep.length) throw new Error("buildSegmentExportArgs: need one gain per segment.");

  const graph = keep.map((seg, i) => {
    const filters = [...splitChain(seg, duration), ...outputFilters(seg.end - seg.start, options, gainsDb?.[i])];
    return `[0:a:0]${filters.length ? filters.join(",") : "anull"}[o${i}]`;
  });

  const enc = encoderArgs(options.format ?? DEFAULT_FORMAT, options);
  const args = ["-i", inputName, "-filter_complex", graph.join(";"), ...INPUT_PROGRESS_OUTPUT];
  outputNames.forEach((name, i) => args.push("-map", `[o${i}]`, ...enc, "-y", name));
  return args;
}

/**
 * Fast normalize, pass 1 for buildSegmentExportArgs: ONE run, one meter per
 * segment (same trims and de-click fades as the export), each writing its
 * readings to `metadataNames[i]` (read them with parseR128Metadata). One file
 * per meter because the log can't tell the meters' summaries apart (see
 * lib/audio/loudness.ts).
 */
export function buildSegmentLoudnessMeasureArgs(
  inputName: string,
  keep: KeepSegment[],
  duration: number,
  metadataNames: string[]
): string[] {
  assertKeep(keep);
  if (metadataNames.length !== keep.length) throw new Error("buildSegmentLoudnessMeasureArgs: need one file name per segment.");
  const graph = keep.map(
    (seg, i) => `[0:a:0]${[...splitChain(seg, duration), ...ebur128MetadataFilters(metadataNames[i])].join(",")}[m${i}]`
  );
  const args = ["-i", inputName, "-filter_complex", graph.join(";"), ...INPUT_PROGRESS_OUTPUT];
  keep.forEach((_, i) => args.push("-map", `[m${i}]`, "-f", "null", "-"));
  return args;
}

/** Arguments for a silencedetect analysis pass (no output file). */
export function buildSilenceDetectArgs(
  inputName: string,
  options: { thresholdDb: number; minSilenceSec: number }
): string[] {
  return [
    "-i", inputName,
    "-map", "0:a:0",
    "-af", `silencedetect=noise=${options.thresholdDb}dB:d=${options.minSilenceSec}`,
    "-f", "null", "-",
  ];
}

/** Zero-padded segment number: 1 → "01" (3 digits from 100 segments on). */
export function segmentNumber(index: number, count: number): string {
  return String(index + 1).padStart(Math.max(2, String(count).length), "0");
}
