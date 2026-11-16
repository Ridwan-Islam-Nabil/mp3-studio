import { describe, expect, it } from "vitest";
import { SILENCE_LUFS, normalizeGainDb, parseEbur128Summary, parseR128Metadata } from "./loudness";

/**
 * Captured from the bundled wasm core (FFmpeg 5.1.4, @ffmpeg/core 0.12.6) running
 * `-filter_complex [0:a:0]ebur128=framelog=verbose[out] -map [out] -f null -` on a 180 s
 * music excerpt. In this run the core logged at verbose level, so the per-frame lines were
 * printed anyway and the `[Parsed_ebur128_0 @ …]` prefix of the summary was missing.
 */
const WASM_LOG = [
  "t: 179.9      TARGET:-23 LUFS    M: -25.8 S: -25.3     I: -28.0 LUFS       LRA:   4.6 LU",
  "t: 180        TARGET:-23 LUFS    M: -25.8 S: -25.2     I: -28.0 LUFS       LRA:   4.6 LU",
  "discard 576/1152 samples",
  "size=N/A time=00:03:00.01 bitrate=N/A speed= 445x    ",
  "7502 frames successfully decoded, 0 decoding errors",
  "Summary:",
  "",
  "  Integrated loudness:",
  "    I:         -28.0 LUFS",
  "    Threshold: -38.1 LUFS",
  "",
  "  Loudness range:",
  "    LRA:         4.6 LU",
  "    Threshold: -48.1 LUFS",
  "    LRA low:   -30.6 LUFS",
  "    LRA high:  -26.0 LUFS",
  "Statistics: 4321772 bytes read, 0 seeks",
  "Aborted()",
];

/** Same core at info level with two meters (the prefix is there; the order is graph-teardown order). */
const WASM_TWO_METERS = [
  "size=N/A time=00:03:00.02 bitrate=N/A speed= 408x    ",
  "[Parsed_ebur128_5 @ 0xe01080] Summary:",
  "",
  "  Integrated loudness:",
  "    I:         -27.5 LUFS",
  "    Threshold: -37.6 LUFS",
  "[Parsed_ebur128_1 @ 0xdffec0] Summary:",
  "",
  "  Integrated loudness:",
  "    I:         -29.1 LUFS",
  "    Threshold: -39.3 LUFS",
  "Aborted()",
];

/** Native FFmpeg 8.0 on the same file: one string, CRLF, with the prefix. */
const NATIVE_LOG = [
  "      encoder         : Lavc62.11.100 pcm_s16le",
  "[Parsed_ebur128_0 @ 00000169f8c21480] Summary:",
  "",
  "  Integrated loudness:",
  "    I:         -28.0 LUFS",
  "    Threshold: -38.1 LUFS",
  "",
  "  Loudness range:",
  "    LRA:         4.6 LU",
  "[out#0/null @ 00000169fa62ce00] video:0KiB audio:33752KiB subtitle:0KiB",
  "size=N/A time=00:03:00.01 bitrate=N/A speed=1.48e+03x elapsed=0:00:00.12    ",
].join("\r\n");

/** `ametadata=mode=print:key=lavfi.r128.I:file=…` output from the wasm core (start and end of a 60 s segment). */
const METADATA_FILE = [
  "frame:0    pts:0       pts_time:0",
  "lavfi.r128.I=-70.000",
  "frame:1    pts:4800    pts_time:0.1",
  "lavfi.r128.I=-70.000",
  "frame:3    pts:14400   pts_time:0.3",
  "lavfi.r128.I=-24.290",
  "frame:598  pts:2870400 pts_time:59.8",
  "lavfi.r128.I=-29.051",
  "frame:599  pts:2875200 pts_time:59.9",
  "lavfi.r128.I=-29.054",
  "",
].join("\n");

describe("parseEbur128Summary", () => {
  it("reads the wasm core's summary, ignoring the per-frame I: values", () => {
    expect(parseEbur128Summary(WASM_LOG)).toBe(-28);
    expect(parseEbur128Summary(WASM_LOG.join("\n"))).toBe(-28);
  });

  it("reads native FFmpeg output with the filter prefix and CRLF", () => {
    expect(parseEbur128Summary(NATIVE_LOG)).toBe(-28);
  });

  it("uses the last summary when there are several", () => {
    expect(parseEbur128Summary(WASM_TWO_METERS)).toBe(-29.1);
  });

  it("returns null without a summary (frame lines alone don't count)", () => {
    expect(parseEbur128Summary(WASM_LOG.slice(0, 5))).toBeNull();
    expect(parseEbur128Summary("")).toBeNull();
    expect(parseEbur128Summary(["Summary:", "", "  Integrated loudness:"])).toBeNull();
  });

  it("parses silence and -inf", () => {
    expect(parseEbur128Summary(["Summary:", "  Integrated loudness:", "    I:         -70.0 LUFS"])).toBe(-70);
    expect(parseEbur128Summary(["Summary:", "    I:         -inf LUFS"])).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe("parseR128Metadata", () => {
  it("takes the last reading", () => {
    expect(parseR128Metadata(METADATA_FILE)).toBe(-29.054);
  });

  it("returns null for an empty file", () => {
    expect(parseR128Metadata("")).toBeNull();
    expect(parseR128Metadata("frame:0    pts:0       pts_time:0\n")).toBeNull();
  });
});

describe("normalizeGainDb", () => {
  it("is target minus measured, rounded to 0.01 dB", () => {
    expect(normalizeGainDb(-28, -16)).toBe(12);
    expect(normalizeGainDb(-29.054, -16)).toBe(13.05);
    expect(normalizeGainDb(-9.5, -16)).toBe(-6.5);
  });

  it("leaves silence alone", () => {
    expect(normalizeGainDb(SILENCE_LUFS, -16)).toBe(0);
    expect(normalizeGainDb(-120.7, -16)).toBe(0);
    expect(normalizeGainDb(Number.NEGATIVE_INFINITY, -16)).toBe(0);
    expect(normalizeGainDb(Number.NaN, -16)).toBe(0);
    expect(normalizeGainDb(-69.9, -16)).toBe(53.9);
  });
});
