import { describe, expect, it } from "vitest";
import { encoderArgs, formatInfo, IPHONE_RINGTONE_MAX_SEC, OUTPUT_FORMATS, withExtension, type OutputFormat } from "./formats";

describe("OUTPUT_FORMATS / formatInfo", () => {
  it.each([
    ["mp3", "mp3", "audio/mpeg", "libmp3lame", "mp3"],
    ["wav", "wav", "audio/wav", "pcm_s16le", "wav"],
    ["m4a", "m4a", "audio/mp4", "aac", "ipod"],
    ["m4r", "m4r", "audio/mp4", "aac", "ipod"],
  ] as const)("%s → .%s, %s, %s in %s", (format, extension, mimeType, codec, muxer) => {
    expect(formatInfo(format)).toMatchObject({ extension, mimeType, codec, muxer });
  });

  it("defaults to mp3", () => {
    expect(formatInfo()).toBe(OUTPUT_FORMATS.mp3);
  });

  it("rejects unknown formats", () => {
    expect(() => formatInfo("ogg" as OutputFormat)).toThrow(/Unsupported output format/);
  });

  it("withExtension appends the format's extension", () => {
    expect(withExtension("song", "m4r")).toBe("song.m4r");
    expect(withExtension("song")).toBe("song.mp3");
  });

  it("exposes the iPhone ringtone limit", () => {
    expect(IPHONE_RINGTONE_MAX_SEC).toBe(40);
  });
});

describe("encoderArgs", () => {
  it("mp3 standard: LAME VBR q2", () => {
    expect(encoderArgs("mp3")).toEqual(["-c:a", "libmp3lame", "-q:a", "2", "-ar", "44100", "-f", "mp3"]);
  });

  it("mp3 high: LAME VBR q0", () => {
    expect(encoderArgs("mp3", { quality: "high" })).toEqual(["-c:a", "libmp3lame", "-q:a", "0", "-ar", "44100", "-f", "mp3"]);
  });

  it("mp3 CBR overrides quality and is clamped to 32–320", () => {
    expect(encoderArgs("mp3", { quality: "high", bitrateKbps: 128 })).toContain("128k");
    expect(encoderArgs("mp3", { bitrateKbps: 999 })).toContain("320k");
    expect(encoderArgs("mp3", { bitrateKbps: 8 })).toContain("32k");
    expect(encoderArgs("mp3", { bitrateKbps: Number.NaN })).toContain("-q:a");
  });

  it("wav: 16-bit PCM, no bitrate", () => {
    expect(encoderArgs("wav", { quality: "high", bitrateKbps: 128 })).toEqual(["-c:a", "pcm_s16le", "-ar", "44100", "-f", "wav"]);
  });

  it.each(["m4a", "m4r"] as const)("%s: AAC in the ipod muxer with faststart", (format) => {
    expect(encoderArgs(format)).toEqual(["-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-movflags", "+faststart", "-f", "ipod"]);
    expect(encoderArgs(format, { quality: "high" })).toContain("256k");
    expect(encoderArgs(format, { bitrateKbps: 96 })).toContain("96k");
  });
});
