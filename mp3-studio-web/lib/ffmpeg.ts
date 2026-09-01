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
 *   loadFFmpeg()         — loads the wasm binary (call once on page mount)
 *   trimAndExport()      — takes cut regions, inverts them, stitches kept parts
 *   getAudioDuration()   — reads duration from an audio file
 *
 * HOW CUT REGIONS WORK:
 *   The UI marks sections to DELETE (red on waveform).
 *   This module inverts them to find KEPT segments, then:
 *     1. Extracts each kept segment as a temp file
 *     2. Concatenates all temp files
 *     3. Returns a Blob the browser can download
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// Singleton — only one FFmpeg instance per page
let ffmpeg: FFmpeg | null = null;
let loaded = false;

export type ProgressCallback = (percent: number) => void;

// ─── Load ────────────────────────────────────────────────────────────────────

/**
 * Loads the FFmpeg WebAssembly binary.
 * Call this once when the editor page mounts.
 * Subsequent calls are instant (already loaded).
 */
export async function loadFFmpeg(onProgress?: ProgressCallback): Promise<void> {
  if (loaded) return;

  ffmpeg = new FFmpeg();

  // The wasm files are loaded from @ffmpeg CDN (unpkg).
  // These are large (~30MB) — load is slow on first visit but cached by browser.
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

  ffmpeg.on("progress", ({ progress }) => {
    onProgress?.(Math.round(progress * 100));
  });

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  loaded = true;
}

export function isFFmpegLoaded(): boolean {
  return loaded;
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

// ─── Core helpers ────────────────────────────────────────────────────────────

/**
 * Inverts cut regions to find which parts of the audio to keep.
 * Example: audio is 60s, cuts are [10-20, 40-50]
 *          → keep [0-10, 20-40, 50-60]
 */
function invertRegions(cuts: CutRegion[], duration: number): KeepSegment[] {
  if (cuts.length === 0) {
    return [{ start: 0, end: duration }];
  }

  // Sort cuts by start time
  const sorted = [...cuts].sort((a, b) => a.start - b.start);
  const keep: KeepSegment[] = [];
  let cursor = 0;

  for (const cut of sorted) {
    if (cut.start > cursor + 0.01) {
      keep.push({ start: cursor, end: cut.start });
    }
    cursor = cut.end;
  }

  if (cursor < duration - 0.01) {
    keep.push({ start: cursor, end: duration });
  }

  return keep;
}

// ─── Main export function ────────────────────────────────────────────────────

/**
 * Trims audio by removing cut regions and returns the result as an MP3 Blob.
 *
 * @param file         The source audio File (any format)
 * @param cutRegions   Array of {start, end} sections to REMOVE
 * @param duration     Total duration of the source audio in seconds
 * @param onProgress   Optional callback with 0-100 progress value
 * @returns            Blob of the exported MP3
 */
export async function trimAndExport(
  file: File,
  cutRegions: CutRegion[],
  duration: number,
  onProgress?: ProgressCallback
): Promise<Blob> {
  if (!ffmpeg || !loaded) throw new Error("FFmpeg not loaded. Call loadFFmpeg() first.");

  const keep = invertRegions(cutRegions, duration);

  // Write source file into FFmpeg's virtual filesystem
  const inputName = "input" + getExtension(file.name);
  await ffmpeg.writeFile(inputName, await fetchFile(file));

  onProgress?.(5);

  const segmentFiles: string[] = [];

  // Extract each kept segment
  for (let i = 0; i < keep.length; i++) {
    const seg = keep[i];
    const segName = `seg_${i}.mp3`;
    segmentFiles.push(segName);

    await ffmpeg.exec([
      "-ss", seg.start.toFixed(3),
      "-to", seg.end.toFixed(3),
      "-i", inputName,
      "-c:a", "libmp3lame",
      "-q:a", "2",       // VBR quality 2 ≈ 190kbps — good balance of quality/size
      "-ar", "44100",
      "-y",
      segName,
    ]);

    onProgress?.(5 + Math.round((i + 1) / keep.length * 70));
  }

  let outputData: Uint8Array;

  if (segmentFiles.length === 1) {
    // Single segment — no concat needed
    outputData = await ffmpeg.readFile(segmentFiles[0]) as Uint8Array;
  } else {
    // Write concat list file
    const concatContent = segmentFiles.map((f) => `file '${f}'`).join("\n");
    await ffmpeg.writeFile("concat.txt", concatContent);

    await ffmpeg.exec([
      "-f", "concat",
      "-safe", "0",
      "-i", "concat.txt",
      "-c", "copy",
      "-y",
      "output.mp3",
    ]);

    outputData = await ffmpeg.readFile("output.mp3") as Uint8Array;
  }

  onProgress?.(100);

  // Clean up virtual filesystem
  await ffmpeg.deleteFile(inputName).catch(() => {});
  for (const f of segmentFiles) {
    await ffmpeg.deleteFile(f).catch(() => {});
  }
  await ffmpeg.deleteFile("concat.txt").catch(() => {});
  await ffmpeg.deleteFile("output.mp3").catch(() => {});

  return new Blob([outputData as unknown as BlobPart], { type: "audio/mpeg" });
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
