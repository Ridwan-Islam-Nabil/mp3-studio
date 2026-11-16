/**
 * lib/audio/formats.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Output formats: file extension, MIME type, encoder + muxer arguments.
 * Pure data and builders (no FFmpeg instance).
 *
 * All four encoders/muxers are present in the bundled @ffmpeg/core build
 * (verified in the browser with `-encoders` / `-muxers`, see CLAUDE.md).
 */

export type OutputFormat = "mp3" | "wav" | "m4a" | "m4r";

export type Quality = "standard" | "high";

export interface FormatInfo {
  /** File extension without the dot. */
  extension: string;
  /** MIME type for the output Blob. */
  mimeType: string;
  /** FFmpeg audio encoder. */
  codec: string;
  /** FFmpeg muxer, passed as `-f` so the output name's extension doesn't matter. */
  muxer: string;
  /** Short human label for a format picker. */
  label: string;
}

export const OUTPUT_FORMATS: Readonly<Record<OutputFormat, FormatInfo>> = {
  mp3: { extension: "mp3", mimeType: "audio/mpeg", codec: "libmp3lame", muxer: "mp3", label: "MP3" },
  wav: { extension: "wav", mimeType: "audio/wav", codec: "pcm_s16le", muxer: "wav", label: "WAV (lossless)" },
  // AAC in an MPEG-4 audio container. The `ipod` muxer is FFmpeg's .m4a flavour of mp4.
  m4a: { extension: "m4a", mimeType: "audio/mp4", codec: "aac", muxer: "ipod", label: "M4A (AAC)" },
  // iPhone ringtone: byte-for-byte the same container as .m4a, only the extension differs.
  m4r: { extension: "m4r", mimeType: "audio/mp4", codec: "aac", muxer: "ipod", label: "iPhone ringtone (M4R)" },
};

export const DEFAULT_FORMAT: OutputFormat = "mp3";

/** Every export is resampled to this rate (CD rate; what LAME and AAC players expect). */
export const OUTPUT_SAMPLE_RATE = 44100;

/**
 * iOS refuses to use a ringtone longer than 40 seconds (it imports, but doesn't
 * show up in Settings → Sounds). Android has no fixed limit.
 */
export const IPHONE_RINGTONE_MAX_SEC = 40;

/** AAC bitrates used for the two `quality` presets (kbps, CBR). */
export const AAC_BITRATE_KBPS: Readonly<Record<Quality, number>> = { standard: 192, high: 256 };

export function formatInfo(format: OutputFormat = DEFAULT_FORMAT): FormatInfo {
  const info = OUTPUT_FORMATS[format];
  if (!info) throw new Error(`Unsupported output format: ${String(format)}`);
  return info;
}

/** `name` + the format's extension, e.g. `withExtension("song", "m4r")` → `"song.m4r"`. */
export function withExtension(name: string, format: OutputFormat = DEFAULT_FORMAT): string {
  return `${name}.${formatInfo(format).extension}`;
}

export interface EncoderOptions {
  /**
   * MP3: 'standard' = LAME VBR -q:a 2 (~190 kbps), 'high' = -q:a 0 (~245 kbps).
   * M4A/M4R: 'standard' = AAC 192 kbps, 'high' = 256 kbps. WAV: ignored.
   */
  quality?: Quality;
  /** Constant bitrate in kbps (clamped to 32–320). Overrides `quality`. Ignored for WAV. */
  bitrateKbps?: number;
}

function clampKbps(kbps: number): number {
  return Math.round(Math.min(320, Math.max(32, kbps)));
}

/**
 * Encoder, sample-rate and muxer arguments for one output file — everything
 * that goes between the `-map` and the output name.
 */
export function encoderArgs(format: OutputFormat = DEFAULT_FORMAT, options: EncoderOptions = {}): string[] {
  const info = formatInfo(format);
  const cbr = options.bitrateKbps !== undefined && Number.isFinite(options.bitrateKbps)
    ? clampKbps(options.bitrateKbps)
    : null;
  const args = ["-c:a", info.codec];

  switch (format) {
    case "mp3":
      if (cbr !== null) args.push("-b:a", `${cbr}k`);
      else args.push("-q:a", options.quality === "high" ? "0" : "2"); // VBR
      break;
    case "m4a":
    case "m4r":
      args.push("-b:a", `${cbr ?? AAC_BITRATE_KBPS[options.quality ?? "standard"]}k`);
      break;
    case "wav":
      break; // PCM: no bitrate setting
  }

  args.push("-ar", String(OUTPUT_SAMPLE_RATE));
  // moov atom first so players (and iOS) can start reading without seeking to the end.
  if (info.muxer === "ipod") args.push("-movflags", "+faststart");
  args.push("-f", info.muxer);
  return args;
}
