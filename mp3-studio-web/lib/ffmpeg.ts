/**
 * lib/ffmpeg.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Public entry point of the audio engine: the FFmpeg.wasm runtime (load, run
 * jobs, read results) plus re-exports of the pure builders in lib/audio/.
 * Import everything from here ("@/lib/ffmpeg").
 *
 * We run FFmpeg entirely in the user's browser (@ffmpeg/ffmpeg, single-threaded
 * core, self-hosted under /ffmpeg/<version>/) — no server, all audio stays local.
 *
 * MODULES:
 *   lib/audio/regions.ts — invertRegions, keepToCuts, mergeRegions (pure)
 *   lib/audio/formats.ts — output formats, MIME types, encoder args (pure)
 *   lib/audio/args.ts    — FFmpeg argument / filter-graph builders (pure)
 *   lib/audio/silence.ts — silencedetect log parsing → cut regions (pure)
 *   lib/audio/log.ts     — FFmpeg log line parsers (pure)
 *   lib/ffmpeg.ts        — this file: runtime + re-exports
 *
 * RUNTIME EXPORTS:
 *   loadFFmpeg()          — loads the wasm binary (idempotent; throws FFmpegLoadError)
 *   isFFmpegLoaded()
 *   isLikelyOutOfMemory() — classifies an error as a probable wasm OOM
 *   exportAudio()         — cut regions → one file in any format ({ blob, mimeType, extension, … })
 *   trimAndExport()       — original API: same as exportAudio() but returns just the Blob
 *   exportSegments()      — cut regions → one file per kept segment
 *   detectSilence()       — silencedetect → CutRegion[] ("remove silence")
 *   getAudioDuration()    — reads duration from an audio file (no FFmpeg)
 *
 * All job functions require loadFFmpeg() to have resolved. Jobs are queued, so
 * two calls never interleave on the shared instance. After ANY failed job the
 * instance is terminated (an OOM can leave the wasm heap unusable) and the next
 * loadFFmpeg() call loads a fresh one.
 *
 * HOW CUT REGIONS WORK:
 *   The UI marks sections to DELETE (red on waveform). invertRegions() turns them
 *   into KEPT segments; one FFmpeg pass decodes once → atrim each kept segment →
 *   short fade at interior joins → concat → (loudnorm) → (fades) → encode once.
 *   For keep mode, convert with keepToCuts() first.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import {
  buildExportArgs, buildSegmentExportArgs, buildSilenceDetectArgs, segmentNumber,
  type ExportOptions,
} from "./audio/args";
import { DEFAULT_FORMAT, formatInfo, type OutputFormat } from "./audio/formats";
import { errorLines, parseInputDuration, parseLogTime } from "./audio/log";
import { invertRegions, totalLength, type CutRegion } from "./audio/regions";
import { DEFAULT_SILENCE_OPTIONS, parseSilenceLog, silencesToCuts, type SilenceOptions } from "./audio/silence";

export * from "./audio/regions";
export * from "./audio/formats";
export * from "./audio/args";
export * from "./audio/silence";
export { parseLogTime, parseInputDuration } from "./audio/log";

export type ProgressCallback = (percent: number) => void;

// Singleton — only one FFmpeg instance per page
let ffmpeg: FFmpeg | null = null;
let loaded = false;

/** Thrown by loadFFmpeg() when the core download / instantiation fails. */
export class FFmpegLoadError extends Error {
  constructor(cause: unknown) {
    super(`Could not load FFmpeg: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "FFmpegLoadError";
  }
}

/**
 * Best-effort check for WebAssembly / browser out-of-memory failures, which
 * happen with long or uncompressed (WAV/FLAC) files.
 */
export function isLikelyOutOfMemory(e: unknown): boolean {
  if (e instanceof RangeError) return true;
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /out of memory|memory access out of bounds|cannot enlarge memory|array buffer allocation failed|allocation failed|\bOOM\b/i.test(msg);
}

// ─── Load ────────────────────────────────────────────────────────────────────

/**
 * Loads the FFmpeg WebAssembly binary.
 * Subsequent calls are instant (already loaded).
 *
 * `onProgress` gets 0 when loading starts and 100 when it finishes (the core
 * download itself does not report byte progress).
 */
export async function loadFFmpeg(onProgress?: ProgressCallback): Promise<void> {
  if (loaded) return;
  onProgress?.(0);

  const instance = new FFmpeg();

  // The core (~30MB wasm) is served from our own origin: scripts/copy-ffmpeg-core.mjs
  // copies it from node_modules/@ffmpeg/core into public/ffmpeg/<version>/, and
  // next.config.ts injects the version and serves that path with an immutable cache.
  // Plain URLs, no toBlobURL: same-origin files need no blob workaround, and a real
  // URL lets the browser stream-compile the wasm and reuse its HTTP cache entry
  // instead of copying 30MB into a Blob first.
  const version = process.env.NEXT_PUBLIC_FFMPEG_CORE_VERSION;

  try {
    if (!version) throw new Error("NEXT_PUBLIC_FFMPEG_CORE_VERSION is not set (see next.config.ts)");
    const baseURL = `${window.location.origin}/ffmpeg/${version}`;
    await instance.load({
      coreURL: `${baseURL}/ffmpeg-core.js`,
      wasmURL: `${baseURL}/ffmpeg-core.wasm`,
    });
  } catch (e) {
    try { instance.terminate(); } catch { /* never started */ }
    throw new FFmpegLoadError(e);
  }

  ffmpeg = instance;
  loaded = true;
  onProgress?.(100);
}

export function isFFmpegLoaded(): boolean {
  return loaded;
}

/**
 * Throws away the current FFmpeg instance. Used after a failed run: an
 * out-of-memory abort can leave the wasm heap unusable, so the next job starts
 * from a fresh instance (loadFFmpeg() reloads it).
 */
function resetFFmpeg(): void {
  try { ffmpeg?.terminate(); } catch { /* already dead */ }
  ffmpeg = null;
  loaded = false;
}

// ─── Job runner ──────────────────────────────────────────────────────────────

/** Serializes jobs: the instance has one virtual FS and one log stream. */
let queue: Promise<unknown> = Promise.resolve();

interface JobSpec {
  file: File;
  inputName: string;
  args: string[];
  /** Files to read back from the virtual FS after a successful run. */
  outputNames: string[];
  /**
   * Seconds of media the stats `time=` field counts up to (5–99 % of progress).
   * A function receives the log so far, for jobs that only learn it from the
   * input header (`Duration:`).
   */
  expectedSec: number | ((logSoFar: string[]) => number | null);
  onProgress?: ProgressCallback;
}

interface JobResult {
  outputs: Uint8Array[];
  log: string[];
}

function runJob(spec: JobSpec): Promise<JobResult> {
  const next = queue.then(() => runJobNow(spec));
  queue = next.catch(() => {});
  return next;
}

async function runJobNow({ file, inputName, args, outputNames, expectedSec, onProgress }: JobSpec): Promise<JobResult> {
  const ff = ffmpeg;
  if (!ff || !loaded) throw new Error("FFmpeg not loaded. Call loadFFmpeg() first.");

  // Progress over the whole job: 0–5 % writing the input, 5–99 % running
  // (stats `time=` / expected seconds), 100 % when the outputs are read back.
  // Parsed from the stats log because @ffmpeg/ffmpeg's own "progress" event
  // divides by the INPUT duration, which is wrong once parts are cut out.
  // Never goes backwards.
  let last = -1;
  const report = (p: number) => {
    const v = Math.max(0, Math.min(100, Math.round(p)));
    if (v > last) { last = v; onProgress?.(v); }
  };

  const log: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    log.push(message);
    const t = parseLogTime(message);
    if (t === null) return;
    const total = typeof expectedSec === "function" ? expectedSec(log) : expectedSec;
    if (total && total > 0) report(5 + Math.min(1, t / total) * 94);
  };

  ff.on("log", onLog);
  let failed = false;
  try {
    report(0);
    await ff.writeFile(inputName, await fetchFile(file));
    report(5);

    const code = await ff.exec(args);
    if (code !== 0) {
      const detail = errorLines(log.slice(-30));
      throw new Error(`FFmpeg exited with code ${code}${detail.length ? ": " + detail.join(" | ") : ""}`);
    }

    const outputs: Uint8Array[] = [];
    for (const name of outputNames) outputs.push((await ff.readFile(name)) as Uint8Array);
    report(100);
    return { outputs, log };
  } catch (e) {
    failed = true;
    throw e;
  } finally {
    ff.off("log", onLog);
    if (failed) {
      resetFFmpeg();
    } else {
      // Free the virtual filesystem (every file lives in wasm memory)
      for (const name of [inputName, ...outputNames]) await ff.deleteFile(name).catch(() => {});
    }
  }
}

function toBlob(data: Uint8Array, mimeType: string): Blob {
  return new Blob([data as unknown as BlobPart], { type: mimeType });
}

// ─── Export ──────────────────────────────────────────────────────────────────

export interface ExportResult {
  blob: Blob;
  format: OutputFormat;
  /** Same as `blob.type`. */
  mimeType: string;
  /** Without the dot, e.g. "m4r". */
  extension: string;
  /** Expected length of the output (sum of the kept segments), seconds. */
  durationSec: number;
}

export interface ExportJobOptions extends ExportOptions {
  /** 0–100. */
  onProgress?: ProgressCallback;
}

/**
 * Removes the cut regions and encodes the rest as ONE file.
 *
 * @param file      The source audio File (any format FFmpeg can decode)
 * @param cuts      Sections to REMOVE ({start, end} seconds); [] = whole file
 * @param duration  Total duration of the source in seconds
 * @param options   format ('mp3' | 'wav' | 'm4a' | 'm4r'), quality / bitrateKbps,
 *                  normalize, fade, onProgress
 */
export async function exportAudio(
  file: File,
  cuts: CutRegion[],
  duration: number,
  options: ExportJobOptions = {}
): Promise<ExportResult> {
  const format = options.format ?? DEFAULT_FORMAT;
  const info = formatInfo(format);
  const keep = invertRegions(cuts, duration);
  const outputSec = totalLength(keep);
  const inputName = "input" + getExtension(file.name);
  const outputName = `output.${info.extension}`;
  const args = buildExportArgs(inputName, keep, duration, outputName, { ...options, format });

  const { outputs } = await runJob({
    file, inputName, args, outputNames: [outputName], expectedSec: outputSec, onProgress: options.onProgress,
  });
  return {
    blob: toBlob(outputs[0], info.mimeType),
    format,
    mimeType: info.mimeType,
    extension: info.extension,
    durationSec: outputSec,
  };
}

/**
 * Original export API, kept for the editor: removes the cut regions and returns
 * the result as a Blob (MP3 unless `options.format` says otherwise; `blob.type`
 * is the format's MIME type). Prefer exportAudio() in new code — it also
 * returns the extension.
 */
export async function trimAndExport(
  file: File,
  cutRegions: CutRegion[],
  duration: number,
  onProgress?: ProgressCallback,
  options: ExportOptions = {}
): Promise<Blob> {
  return (await exportAudio(file, cutRegions, duration, { ...options, onProgress })).blob;
}

export interface SegmentExportOptions extends ExportJobOptions {
  /** File name stem: "talk" → "talk-01.mp3", "talk-02.mp3", … Default: the source name without extension. */
  baseName?: string;
}

export interface SegmentResult extends ExportResult {
  /** e.g. "talk-01.mp3" */
  fileName: string;
  /** 0-based position in the output order. */
  index: number;
  /** Where the segment came from in the source (seconds). */
  start: number;
  end: number;
}

/**
 * Exports every kept segment (everything between the cuts) as its own file, in
 * one FFmpeg run (see buildSegmentExportArgs() for why one run). Options apply
 * to each file: `normalize` normalizes each file separately, `fade` fades each
 * file's start/end. Throws if everything is cut.
 */
export async function exportSegments(
  file: File,
  cuts: CutRegion[],
  duration: number,
  options: SegmentExportOptions = {}
): Promise<SegmentResult[]> {
  const format = options.format ?? DEFAULT_FORMAT;
  const info = formatInfo(format);
  const keep = invertRegions(cuts, duration);
  const inputName = "input" + getExtension(file.name);
  const vfsNames = keep.map((_, i) => `seg-${segmentNumber(i, keep.length)}.${info.extension}`);
  const args = buildSegmentExportArgs(inputName, keep, duration, vfsNames, { ...options, format });
  const stem = options.baseName?.trim() || stripExtension(file.name) || "audio";

  const { outputs } = await runJob({
    file, inputName, args, outputNames: vfsNames, expectedSec: duration, onProgress: options.onProgress,
  });
  return keep.map((seg, i) => ({
    blob: toBlob(outputs[i], info.mimeType),
    format,
    mimeType: info.mimeType,
    extension: info.extension,
    durationSec: seg.end - seg.start,
    fileName: `${stem}-${segmentNumber(i, keep.length)}.${info.extension}`,
    index: i,
    start: seg.start,
    end: seg.end,
  }));
}

// ─── Silence detection ───────────────────────────────────────────────────────

export interface DetectSilenceOptions extends SilenceOptions {
  /**
   * Source duration in seconds (e.g. from WaveSurfer). Used to close a silence
   * that runs to the end and to clamp the result. Default: read from FFmpeg's
   * input header.
   */
  duration?: number;
  onProgress?: ProgressCallback;
}

/**
 * Finds silent stretches with FFmpeg's `silencedetect` and returns them as cut
 * regions (padding kept next to the remaining audio, merged, clamped to the
 * duration) — ready to merge with the user's cuts or show for review.
 *
 * Defaults: thresholdDb -40, minSilenceSec 0.7, paddingSec 0.15.
 */
export async function detectSilence(file: File, options: DetectSilenceOptions = {}): Promise<CutRegion[]> {
  const thresholdDb = options.thresholdDb ?? DEFAULT_SILENCE_OPTIONS.thresholdDb;
  const minSilenceSec = options.minSilenceSec ?? DEFAULT_SILENCE_OPTIONS.minSilenceSec;
  const paddingSec = options.paddingSec ?? DEFAULT_SILENCE_OPTIONS.paddingSec;
  const inputName = "input" + getExtension(file.name);
  const args = buildSilenceDetectArgs(inputName, { thresholdDb, minSilenceSec });

  let headerDuration: number | null = null;
  const { log } = await runJob({
    file, inputName, args, outputNames: [], onProgress: options.onProgress,
    expectedSec: (lines) => {
      if (options.duration) return options.duration;
      headerDuration ??= parseInputDuration(lines.join("\n"));
      return headerDuration;
    },
  });

  // The final stats `time=` is the decoded length; the header's Duration is only
  // an estimate for MP3 (180.04 s for a 180.00 s file in testing), which would
  // leave a padded sliver after a silence that runs to the end.
  const duration = options.duration ?? lastLogTime(log) ?? parseInputDuration(log.join("\n"));
  if (duration === null) throw new Error("detectSilence: could not determine the audio duration; pass options.duration.");
  return silencesToCuts(parseSilenceLog(log, duration), duration, paddingSec);
}

// ─── Duration helper ─────────────────────────────────────────────────────────

/**
 * Returns the duration of an audio File in seconds using an <audio> element.
 * This is fast (no FFmpeg needed) and works in all modern browsers.
 */
export async function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.onloadedmetadata = () => {
      resolve(audio.duration);
      URL.revokeObjectURL(audio.src);
    };
    audio.onerror = reject;
    audio.src = URL.createObjectURL(file);
  });
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? "." + parts.pop()!.toLowerCase() : ".mp3";
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

function lastLogTime(log: readonly string[]): number | null {
  for (let i = log.length - 1; i >= 0; i--) {
    const t = parseLogTime(log[i]);
    if (t !== null) return t;
  }
  return null;
}
