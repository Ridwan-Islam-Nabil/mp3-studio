/**
 * lib/ffmpeg.ts is the public entry point: the editor and the wave-4 UI import everything
 * from it. The builders themselves are tested next to their modules in lib/audio/.
 */
import { describe, expect, it } from "vitest";
import * as engine from "./ffmpeg";

describe("lib/ffmpeg public API", () => {
  it.each([
    // used by the editor today
    "loadFFmpeg", "trimAndExport", "FFmpegLoadError", "isLikelyOutOfMemory", "isFFmpegLoaded", "getAudioDuration",
    // pure builders
    "invertRegions", "keepToCuts", "mergeRegions", "totalLength", "buildExportArgs", "buildSegmentExportArgs",
    "buildSilenceDetectArgs", "parseSilenceLog", "silencesToCuts", "encoderArgs", "formatInfo", "withExtension",
    "parseLogTime", "parseInputDuration",
    // jobs
    "exportAudio", "exportSegments", "detectSilence",
    // constants
    "OUTPUT_FORMATS", "IPHONE_RINGTONE_MAX_SEC", "LOUDNORM_TARGET", "DEFAULT_SILENCE_OPTIONS",
  ])("exports %s", (name) => {
    expect(engine).toHaveProperty(name);
  });

  it("job functions refuse to run before loadFFmpeg()", async () => {
    const file = new File([new Uint8Array(4)], "a.mp3");
    await expect(engine.exportAudio(file, [], 1)).rejects.toThrow(/not loaded/);
    await expect(engine.trimAndExport(file, [], 1)).rejects.toThrow(/not loaded/);
    await expect(engine.exportSegments(file, [], 1)).rejects.toThrow(/not loaded/);
    await expect(engine.detectSilence(file)).rejects.toThrow(/not loaded/);
  });
});
