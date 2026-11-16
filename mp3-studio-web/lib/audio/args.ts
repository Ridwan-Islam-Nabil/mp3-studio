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
 *        → concat → loudnorm → asetpts → afade in → afade out → [out]
 */

import { DEFAULT_FORMAT, encoderArgs, type EncoderOptions, type OutputFormat } from "./formats";
import { totalLength, type KeepSegment } from "./regions";

/** Fade length applied on each side of an interior join / cut edge (seconds). */
export const JOIN_FADE_SEC = 0.012;

/** Edges closer than this to the file start/end are treated as the start/end. */
export const EDGE_EPSILON_SEC = 0.01;

/**
 * Loudness target for `normalize` (EBU R128 single-pass `loudnorm`):
 * -16 LUFS integrated, -1.5 dBTP true peak, LRA 11 — the common target for
 * podcasts / streaming on mobile.
 */
export const LOUDNORM_TARGET = { integratedLufs: -16, truePeakDb: -1.5, lra: 11 } as const;

export interface FadeOptions {
  /** Fade-in length at the very start of the output file (seconds). */
  inSec?: number;
  /** Fade-out length at the very end of the output file (seconds). */
  outSec?: number;
}

export interface ExportOptions extends EncoderOptions {
  /** Output format. Default 'mp3'. */
  format?: OutputFormat;
  /** Apply single-pass EBU R128 loudness normalization (LOUDNORM_TARGET) to the output. */
  normalize?: boolean;
  /**
   * Fades at the start/end of the output file (ringtones). Applied after
   * normalization. If inSec + outSec exceed the output length they are scaled
   * down proportionally.
   */
  fade?: FadeOptions;
}

const f6 = (n: number) => n.toFixed(6);

/** `loudnorm` filter string for LOUDNORM_TARGET. */
export function loudnormFilter(): string {
  const t = LOUDNORM_TARGET;
  return `loudnorm=I=${t.integratedLufs}:TP=${t.truePeakDb}:LRA=${t.lra}`;
}

/**
 * Filters applied to a finished output stream of `outputSec` seconds:
 * loudness normalization, then the start/end fades.
 */
export function outputFilters(outputSec: number, options: Pick<ExportOptions, "normalize" | "fade"> = {}): string[] {
  const filters: string[] = [];
  if (options.normalize) filters.push(loudnormFilter());

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

/**
 * Builds the FFmpeg arguments for one export pass: kept segments → one output
 * file in `options.format` (default MP3). See the module comment for why it is
 * a single filter graph.
 *
 * With zero cuts and no output filters there is no graph at all (`-map 0:a:0`).
 */
export function buildExportArgs(
  inputName: string,
  keep: KeepSegment[],
  duration: number,
  outputName: string,
  options: ExportOptions = {}
): string[] {
  if (keep.length === 0) throw new Error("Nothing to export — every part of the audio is cut.");

  const n = keep.length;
  // Interior joins only: fade out every segment but the last, fade in every one but the first.
  const chains = keep.map((seg, i) => segmentFilters(seg, duration, { in: n > 1 && i > 0, out: n > 1 && i < n - 1 }));
  const post = outputFilters(totalLength(keep), options);

  const args = ["-i", inputName];
  if (n === 1 && chains[0].length === 0 && post.length === 0) {
    // Zero cuts, nothing to apply: whole stream, no filter graph needed.
    args.push("-map", "0:a:0");
  } else if (n === 1) {
    args.push("-filter_complex", `[0:a:0]${[...chains[0], ...post].join(",") || "anull"}[out]`, "-map", "[out]");
  } else {
    const parts = chains.map((f, i) => `[0:a:0]${f.length ? f.join(",") : "anull"}[s${i}]`);
    const inputs = chains.map((_, i) => `[s${i}]`).join("");
    parts.push(`${inputs}${[`concat=n=${n}:v=0:a=1`, ...post].join(",")}[out]`);
    args.push("-filter_complex", parts.join(";"), "-map", "[out]");
  }

  args.push(...encoderArgs(options.format ?? DEFAULT_FORMAT, options), "-y", outputName);
  return args;
}

/**
 * Builds ONE FFmpeg run that writes every kept segment to its own file
 * (`outputNames[i]` for `keep[i]`). The input is decoded once and split inside
 * the filter graph, which is much faster than one run per segment (each of
 * those would decode the source from the beginning to reach its `atrim`).
 *
 * Each file gets a 12 ms de-click fade at edges that were cut points (not at the
 * source's own start/end), then `normalize` / `fade` per file.
 *
 * The first output is a stream copy of the input into the null muxer. It costs
 * almost nothing, keeps the demuxer reading to the end, and makes the stats
 * line's `time=` follow the INPUT position, which is what progress needs here
 * (the segment outputs' times jump around).
 */
export function buildSegmentExportArgs(
  inputName: string,
  keep: KeepSegment[],
  duration: number,
  outputNames: string[],
  options: ExportOptions = {}
): string[] {
  if (keep.length === 0) throw new Error("Nothing to export — every part of the audio is cut.");
  if (outputNames.length !== keep.length) throw new Error("buildSegmentExportArgs: need one output name per segment.");

  const graph = keep.map((seg, i) => {
    const filters = [
      ...segmentFilters(seg, duration, {
        in: seg.start > EDGE_EPSILON_SEC,
        out: seg.end < duration - EDGE_EPSILON_SEC,
      }),
      ...outputFilters(seg.end - seg.start, options),
    ];
    return `[0:a:0]${filters.length ? filters.join(",") : "anull"}[o${i}]`;
  });

  const enc = encoderArgs(options.format ?? DEFAULT_FORMAT, options);
  const args = ["-i", inputName, "-filter_complex", graph.join(";"), "-map", "0:a:0", "-c", "copy", "-f", "null", "-"];
  outputNames.forEach((name, i) => args.push("-map", `[o${i}]`, ...enc, "-y", name));
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
