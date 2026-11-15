/**
 * lib/ffmpeg.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Browser-side FFmpeg wrapper using @ffmpeg/ffmpeg (WebAssembly).
 *
 * WHY THIS EXISTS:
 *   We run FFmpeg entirely in the user's browser — no server needed, zero cost.
 *   The @ffmpeg/ffmpeg library loads a ~30MB WebAssembly binary on first use and
 *   caches it automatically. All audio processing is local and private.
 *
 * REQUIREMENT:
 *   The Next.js config must set these headers or FFmpeg will fail:
 *     Cross-Origin-Opener-Policy: same-origin
 *     Cross-Origin-Embedder-Policy: require-corp
 *   These are already set in next.config.ts.
 *
 * EXPORTS:
 *   loadFFmpeg()         — loads the wasm binary (idempotent; throws FFmpegLoadError)
 *   isLikelyOutOfMemory()— classifies an error as a probable wasm OOM
 *   invertRegions()      — cut regions → kept segments (pure)
 *   buildExportArgs()    — kept segments → FFmpeg argument list (pure)
 *   trimAndExport()      — takes cut regions, inverts them, stitches kept parts
 *   getAudioDuration()   — reads duration from an audio file
 *
 * HOW CUT REGIONS WORK:
 *   The UI marks sections to DELETE (red on waveform).
 *   This module inverts them to find KEPT segments, then runs ONE FFmpeg pass:
 *     decode once → atrim each kept segment → short fade at interior joins →
 *     concat filter → encode once to MP3.
 *   See buildExportArgs() for why it is a single filter graph.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// Singleton — only one FFmpeg instance per page
let ffmpeg: FFmpeg | null = null;
let loaded = false;

export type ProgressCallback = (percent: number) => void;

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

  // The wasm files are loaded from @ffmpeg CDN (unpkg).
  // These are large (~30MB) — load is slow on first visit but cached by browser.
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

  try {
    await instance.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
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
 * out-of-memory abort can leave the wasm heap unusable, so the next Preview /
 * Export starts from a fresh instance (loadFFmpeg() reloads it).
 */
function resetFFmpeg(): void {
  try { ffmpeg?.terminate(); } catch { /* already dead */ }
  ffmpeg = null;
  loaded = false;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CutRegion {
  start: number; // seconds
  end: number;   // seconds
}

export interface KeepSegment {
  start: number;
  end: number;
}

export interface ExportOptions {
  /**
   * 'standard' (default) — LAME VBR -q:a 2 (~190 kbps), the original behavior.
   * 'high'               — LAME VBR -q:a 0 (~245 kbps).
   * Ignored when `bitrateKbps` is set.
   */
  quality?: "standard" | "high";
  /** Constant bitrate in kbps (clamped to 32–320). Overrides `quality`. */
  bitrateKbps?: number;
}

// ─── Core helpers ────────────────────────────────────────────────────────────

/**
 * Inverts cut regions to find which parts of the audio to keep.
 * Example: audio is 60s, cuts are [10-20, 40-50]
 *          → keep [0-10, 20-40, 50-60]
 */
export function invertRegions(cuts: CutRegion[], duration: number): KeepSegment[] {
  if (cuts.length === 0) {
    return [{ start: 0, end: duration }];
  }

  // Clamp cuts to the audio, drop empty ones, sort by start time
  const sorted = cuts
    .map((c) => ({ start: Math.max(0, c.start), end: Math.min(duration, c.end) }))
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start);
  const keep: KeepSegment[] = [];
  let cursor = 0;

  for (const cut of sorted) {
    if (cut.start > cursor + 0.01) {
      keep.push({ start: cursor, end: cut.start });
    }
    // max(): a cut nested inside an earlier one must not move the cursor back
    cursor = Math.max(cursor, cut.end);
  }

  if (cursor < duration - 0.01) {
    keep.push({ start: cursor, end: duration });
  }

  return keep;
}

/** Fade length applied on each side of an interior join (seconds). */
const JOIN_FADE_SEC = 0.012;

/** Edges closer than this to the file start/end are treated as the start/end. */
const EDGE_EPSILON_SEC = 0.01;

/**
 * Builds the FFmpeg arguments for one export pass.
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
 *   encoded exactly once. The file's very start and end are never faded.
 *
 * Segment edges at 0 / `duration` are left open so the output runs to the true
 * start/end of the stream even if the browser-reported duration is slightly off.
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
  const chains = keep.map((seg, i) => {
    const filters: string[] = [];
    const trim: string[] = [];
    if (seg.start > EDGE_EPSILON_SEC) trim.push(`start=${seg.start.toFixed(6)}`);
    if (seg.end < duration - EDGE_EPSILON_SEC) trim.push(`end=${seg.end.toFixed(6)}`);
    if (trim.length) filters.push(`atrim=${trim.join(":")}`, "asetpts=PTS-STARTPTS");

    // Interior joins only: fade out the end of every segment except the last,
    // fade in the start of every segment except the first. Never longer than
    // half the segment so the two fades can't overlap.
    const segDur = seg.end - seg.start;
    const fade = Math.min(JOIN_FADE_SEC, segDur / 2);
    if (n > 1 && fade > 0) {
      if (i > 0) filters.push(`afade=t=in:st=0:d=${fade.toFixed(6)}`);
      if (i < n - 1) filters.push(`afade=t=out:st=${(segDur - fade).toFixed(6)}:d=${fade.toFixed(6)}`);
    }
    return filters;
  });

  const args = ["-i", inputName];

  if (n === 1 && chains[0].length === 0) {
    // Zero cuts: whole stream, no filter graph needed.
    args.push("-map", "0:a:0");
  } else if (n === 1) {
    args.push("-filter_complex", `[0:a:0]${chains[0].join(",")}[out]`, "-map", "[out]");
  } else {
    const parts = chains.map((f, i) => `[0:a:0]${f.length ? f.join(",") : "anull"}[s${i}]`);
    const inputs = chains.map((_, i) => `[s${i}]`).join("");
    parts.push(`${inputs}concat=n=${n}:v=0:a=1[out]`);
    args.push("-filter_complex", parts.join(";"), "-map", "[out]");
  }

  args.push("-c:a", "libmp3lame");
  if (options.bitrateKbps !== undefined && Number.isFinite(options.bitrateKbps)) {
    const kbps = Math.round(Math.min(320, Math.max(32, options.bitrateKbps)));
    args.push("-b:a", `${kbps}k`);
  } else {
    // VBR: q 2 ≈ 190 kbps (default), q 0 ≈ 245 kbps
    args.push("-q:a", options.quality === "high" ? "0" : "2");
  }
  args.push("-ar", "44100", "-y", outputName);
  return args;
}

/** Parses the `time=HH:MM:SS.xx` field of an FFmpeg stats log line. */
function parseLogTime(line: string): number | null {
  const m = /time=\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(line);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

// ─── Main export function ────────────────────────────────────────────────────

/**
 * Trims audio by removing cut regions and returns the result as an MP3 Blob.
 *
 * @param file         The source audio File (any format)
 * @param cutRegions   Array of {start, end} sections to REMOVE
 * @param duration     Total duration of the source audio in seconds
 * @param onProgress   Optional callback with 0-100 progress value
 * @param options      Optional encoder settings (defaults to VBR -q:a 2)
 * @returns            Blob of the exported MP3
 */
export async function trimAndExport(
  file: File,
  cutRegions: CutRegion[],
  duration: number,
  onProgress?: ProgressCallback,
  options: ExportOptions = {}
): Promise<Blob> {
  const ff = ffmpeg;
  if (!ff || !loaded) throw new Error("FFmpeg not loaded. Call loadFFmpeg() first.");

  const keep = invertRegions(cutRegions, duration);
  const outputSec = keep.reduce((s, k) => s + (k.end - k.start), 0);
  const inputName = "input" + getExtension(file.name);
  const outputName = "output.mp3";
  const args = buildExportArgs(inputName, keep, duration, outputName, options);

  // Progress over the whole job: 0–5% writing the input, 5–99% encoding
  // (encoded output time / expected output length), 100% when the Blob is ready.
  // Parsed from the stats log because @ffmpeg/ffmpeg's own "progress" event
  // divides by the INPUT duration, which is wrong once parts are cut out.
  const report = (p: number) => onProgress?.(Math.max(0, Math.min(100, Math.round(p))));
  const recentLogs: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    recentLogs.push(message);
    if (recentLogs.length > 30) recentLogs.shift();
    const t = parseLogTime(message);
    if (t !== null && outputSec > 0) report(5 + Math.min(1, t / outputSec) * 94);
  };

  ff.on("log", onLog);
  let failed = false;
  try {
    report(0);
    await ff.writeFile(inputName, await fetchFile(file));
    report(5);

    const code = await ff.exec(args);
    if (code !== 0) {
      const detail = recentLogs.filter((l) => /error|invalid|failed|cannot|unable/i.test(l)).slice(-3);
      throw new Error(`FFmpeg exited with code ${code}${detail.length ? ": " + detail.join(" | ") : ""}`);
    }

    const outputData = (await ff.readFile(outputName)) as Uint8Array;
    report(100);
    return new Blob([outputData as unknown as BlobPart], { type: "audio/mpeg" });
  } catch (e) {
    failed = true;
    throw e;
  } finally {
    ff.off("log", onLog);
    if (failed) {
      resetFFmpeg();
    } else {
      // Free the virtual filesystem (both files live in wasm memory)
      await ff.deleteFile(inputName).catch(() => {});
      await ff.deleteFile(outputName).catch(() => {});
    }
  }
}

// ─── Duration helper ─────────────────────────────────────────────────────────

/**
 * Returns the duration of an audio File in seconds using the Web Audio API.
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
