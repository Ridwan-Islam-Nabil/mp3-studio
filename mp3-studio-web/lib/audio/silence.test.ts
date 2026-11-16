import { describe, expect, it } from "vitest";
import { parseSilenceLog, silencesToCuts } from "./silence";

/**
 * Captured from the bundled wasm core (FFmpeg 5.1.4, @ffmpeg/core 0.12.6) running
 * `-af silencedetect=noise=-40dB:d=0.7` on a 180 s test file with silent stretches at
 * 30–33 s, 90–91.5 s, 150–150.4 s (too short) and 177–180 s. The wasm build sends the
 * `[silencedetect @ …]` prefix as its own log event, so lines arrive without it, and the
 * trailing silence_end is printed after the end-of-run statistics.
 */
const WASM_LOG = [
  "  Duration: 00:03:00.04, start: 0.025057, bitrate: 97 kb/s",
  "  Stream #0:0 -> #0:0 (mp3 (mp3float) -> pcm_s16le (native))",
  "Setting 'noise' to value '-40dB'",
  "size=N/A time=00:00:00.00 bitrate=N/A speed=N/A    ",
  "silence_start: 30.0217",
  "silence_end: 33.0184 | silence_duration: 2.99671",
  "silence_start: 90.0214",
  "silence_end: 91.5092 | silence_duration: 1.48787",
  "silence_start: 177.005",
  "discard 479/1152 samples",
  "size=N/A time=00:03:00.00 bitrate=N/A speed= 668x    ",
  "6892 frames successfully decoded, 0 decoding errors",
  "silence_end: 180 | silence_duration: 2.9951",
  "Aborted()",
];

/** Same file through native FFmpeg 8.0 (one string, with the filter prefix, CRLF). */
const NATIVE_LOG = [
  "  Duration: 00:03:00.00, start: 0.025057, bitrate: 97 kb/s",
  "[silencedetect @ 0000013adda93540] silence_start: 30.021701",
  "[silencedetect @ 0000013adda93540] silence_end: 33.018413 | silence_duration: 2.996712",
  "[silencedetect @ 0000013adda93540] silence_start: 90.021361",
  "[silencedetect @ 0000013adda93540] silence_end: 91.509229 | silence_duration: 1.487868",
  "[silencedetect @ 0000013adda93540] silence_start: 177.004898",
  "[silencedetect @ 0000013adda93540] silence_end: 180 | silence_duration: 2.995102",
].join("\r\n");

describe("parseSilenceLog", () => {
  it("parses the wasm core's log lines", () => {
    expect(parseSilenceLog(WASM_LOG, 180)).toEqual([
      { start: 30.0217, end: 33.0184 },
      { start: 90.0214, end: 91.5092 },
      { start: 177.005, end: 180 },
    ]);
  });

  it("parses native FFmpeg output given as one string", () => {
    const s = parseSilenceLog(NATIVE_LOG, 180);
    expect(s).toHaveLength(3);
    expect(s[0].start).toBeCloseTo(30.021701, 6);
    expect(s[2]).toEqual({ start: 177.004898, end: 180 });
  });

  it("closes a trailing silence_start at the duration (older builds print no final end)", () => {
    expect(parseSilenceLog(["silence_start: 55.5"], 60)).toEqual([{ start: 55.5, end: 60 }]);
  });

  it("drops a trailing silence_start when the duration is unknown", () => {
    expect(parseSilenceLog(["silence_start: 1", "silence_end: 2 | silence_duration: 1", "silence_start: 55.5"])).toEqual([
      { start: 1, end: 2 },
    ]);
  });

  it("clamps a negative start and ends past the duration", () => {
    expect(parseSilenceLog(["silence_start: -0.00133", "silence_end: 1.2 | x", "silence_start: 59", "silence_end: 60.4"], 60)).toEqual([
      { start: 0, end: 1.2 },
      { start: 59, end: 60 },
    ]);
  });

  it("ignores an end without a start and unrelated lines", () => {
    expect(parseSilenceLog(["silence_end: 3 | silence_duration: 1", "time=00:00:05.00", "frame=1"], 10)).toEqual([]);
  });

  it("returns [] when there is no silence", () => {
    expect(parseSilenceLog("", 10)).toEqual([]);
  });
});

describe("silencesToCuts", () => {
  it("keeps padding next to the remaining audio, none at the file edges", () => {
    const cuts = silencesToCuts(parseSilenceLog(WASM_LOG, 180), 180, 0.15);
    expect(cuts).toHaveLength(3);
    expect(cuts[0].start).toBeCloseTo(30.1717);
    expect(cuts[0].end).toBeCloseTo(32.8684);
    expect(cuts[1].start).toBeCloseTo(90.1714);
    expect(cuts[1].end).toBeCloseTo(91.3592);
    expect(cuts[2].start).toBeCloseTo(177.155);
    expect(cuts[2].end).toBe(180);
  });

  it("treats a silence ending within 50 ms of the duration as running to the end", () => {
    // FFmpeg reports silence_end: 180 while the browser says the file is 180.026 s long.
    expect(silencesToCuts([{ start: 177.005, end: 180 }], 180.026, 0.15)).toEqual([{ start: 177.155, end: 180.026 }]);
    expect(silencesToCuts([{ start: 177.005, end: 179.9 }], 180.026, 0.15)[0].end).toBeCloseTo(179.75);
  });

  it("cuts leading silence from 0", () => {
    expect(silencesToCuts([{ start: 0, end: 2 }], 10, 0.15)).toEqual([{ start: 0, end: 1.85 }]);
  });

  it("drops silences that padding makes (nearly) empty", () => {
    expect(silencesToCuts([{ start: 4, end: 4.32 }], 10, 0.15)).toEqual([]);
    expect(silencesToCuts([{ start: 4, end: 4.36 }], 10, 0.15)).toHaveLength(1);
  });

  it("merges cuts that overlap and clamps to the duration", () => {
    expect(silencesToCuts([{ start: 1, end: 3 }, { start: 2.5, end: 5 }, { start: 8, end: 12 }], 10, 0)).toEqual([
      { start: 1, end: 5 },
      { start: 8, end: 10 },
    ]);
  });

  it("treats negative padding as zero", () => {
    expect(silencesToCuts([{ start: 4, end: 6 }], 10, -1)).toEqual([{ start: 4, end: 6 }]);
  });

  it("returns [] for no silences", () => {
    expect(silencesToCuts([], 10)).toEqual([]);
  });
});
