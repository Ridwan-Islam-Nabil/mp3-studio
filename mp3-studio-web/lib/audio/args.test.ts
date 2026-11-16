import { describe, expect, it } from "vitest";
import {
  buildExportArgs, buildSegmentExportArgs, buildSilenceDetectArgs, loudnormFilter, outputFilters,
  segmentFilters, segmentNumber,
} from "./args";
import { invertRegions, type KeepSegment } from "./regions";

const seg = (start: number, end: number): KeepSegment => ({ start, end });
/** The -filter_complex value of an argument list. */
const graph = (args: string[]) => args[args.indexOf("-filter_complex") + 1];
const MP3_TAIL = ["-c:a", "libmp3lame", "-q:a", "2", "-ar", "44100", "-f", "mp3", "-y", "out.mp3"];

describe("buildExportArgs", () => {
  it("zero cuts: no filter graph, whole stream", () => {
    expect(buildExportArgs("in.mp3", invertRegions([], 60), 60, "out.mp3")).toEqual(["-i", "in.mp3", "-map", "0:a:0", ...MP3_TAIL]);
  });

  it("one segment: atrim, no join fades", () => {
    expect(buildExportArgs("in.mp3", [seg(0, 50)], 60, "out.mp3")).toEqual([
      "-i", "in.mp3", "-filter_complex", "[0:a:0]atrim=end=50.000000,asetpts=PTS-STARTPTS[out]", "-map", "[out]", ...MP3_TAIL,
    ]);
  });

  it("several segments: open outer edges, fades only at interior joins, concat", () => {
    const keep = invertRegions([{ start: 10, end: 20 }, { start: 40, end: 50 }], 60);
    expect(graph(buildExportArgs("in.mp3", keep, 60, "out.mp3"))).toBe(
      "[0:a:0]atrim=end=10.000000,asetpts=PTS-STARTPTS,afade=t=out:st=9.988000:d=0.012000[s0];" +
      "[0:a:0]atrim=start=20.000000:end=40.000000,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.012000,afade=t=out:st=19.988000:d=0.012000[s1];" +
      "[0:a:0]atrim=start=50.000000,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.012000[s2];" +
      "[s0][s1][s2]concat=n=3:v=0:a=1[out]"
    );
  });

  it("caps join fades at half a very short segment", () => {
    const g = graph(buildExportArgs("in.mp3", [seg(0, 10), seg(20, 20.01), seg(30, 60)], 60, "out.mp3"));
    expect(g).toContain("afade=t=in:st=0:d=0.005000,afade=t=out:st=0.005000:d=0.005000[s1]");
  });

  it("throws when everything is cut", () => {
    expect(() => buildExportArgs("in.mp3", [], 60, "out.mp3")).toThrow(/Nothing to export/);
  });

  it.each([
    ["wav", ["-c:a", "pcm_s16le", "-ar", "44100", "-f", "wav", "-y", "out.wav"]],
    ["m4a", ["-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-movflags", "+faststart", "-f", "ipod", "-y", "out.m4a"]],
    ["m4r", ["-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-movflags", "+faststart", "-f", "ipod", "-y", "out.m4r"]],
  ] as const)("format %s uses the right encoder and muxer", (format, tail) => {
    const args = buildExportArgs("in.flac", [seg(0, 60)], 60, `out.${format}`, { format });
    expect(args).toEqual(["-i", "in.flac", "-map", "0:a:0", ...tail]);
  });

  it("normalize appends loudnorm after concat", () => {
    const keep = invertRegions([{ start: 10, end: 20 }], 60);
    expect(graph(buildExportArgs("in.mp3", keep, 60, "out.mp3", { normalize: true }))).toMatch(
      /\[s0\]\[s1\]concat=n=2:v=0:a=1,loudnorm=I=-16:TP=-1\.5:LRA=11\[out\]$/
    );
  });

  it("normalize with zero cuts builds a graph instead of -map 0:a:0", () => {
    const args = buildExportArgs("in.mp3", [seg(0, 60)], 60, "out.mp3", { normalize: true });
    expect(graph(args)).toBe("[0:a:0]loudnorm=I=-16:TP=-1.5:LRA=11[out]");
    expect(args).toContain("[out]");
  });

  it("fades the output start and end, after normalization", () => {
    const args = buildExportArgs("in.mp3", [seg(5, 35)], 60, "out.m4r", {
      format: "m4r", normalize: true, fade: { inSec: 1, outSec: 2 },
    });
    expect(graph(args)).toBe(
      "[0:a:0]atrim=start=5.000000:end=35.000000,asetpts=PTS-STARTPTS," +
      "loudnorm=I=-16:TP=-1.5:LRA=11,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1.000000,afade=t=out:st=28.000000:d=2.000000[out]"
    );
  });

  it("fade-out position uses the OUTPUT length (sum of kept segments)", () => {
    const keep = invertRegions([{ start: 10, end: 20 }], 60); // 50 s out
    expect(graph(buildExportArgs("in.mp3", keep, 60, "out.mp3", { fade: { outSec: 3 } }))).toMatch(
      /concat=n=2:v=0:a=1,asetpts=PTS-STARTPTS,afade=t=out:st=47\.000000:d=3\.000000\[out\]$/
    );
  });
});

describe("outputFilters", () => {
  it("is empty by default", () => {
    expect(outputFilters(30)).toEqual([]);
    expect(outputFilters(30, { fade: {} })).toEqual([]);
  });

  it("scales fades down when they are longer than the output", () => {
    expect(outputFilters(3, { fade: { inSec: 2, outSec: 4 } })).toEqual([
      "asetpts=PTS-STARTPTS", "afade=t=in:st=0:d=1.000000", "afade=t=out:st=1.000000:d=2.000000",
    ]);
  });

  it("ignores negative and non-finite fades", () => {
    expect(outputFilters(30, { fade: { inSec: -1, outSec: Number.POSITIVE_INFINITY } })).toEqual([]);
  });

  it("loudnormFilter targets -16 LUFS / -1.5 dBTP", () => {
    expect(loudnormFilter()).toBe("loudnorm=I=-16:TP=-1.5:LRA=11");
  });
});

describe("segmentFilters", () => {
  it("leaves edges at the file start/end open", () => {
    expect(segmentFilters(seg(0, 60), 60, { in: false, out: false })).toEqual([]);
    expect(segmentFilters(seg(0.005, 59.995), 60, { in: false, out: false })).toEqual([]);
  });
});

describe("buildSegmentExportArgs", () => {
  const keep = invertRegions([{ start: 10, end: 20 }, { start: 40, end: 50 }], 60);
  const names = ["seg-01.mp3", "seg-02.mp3", "seg-03.mp3"];

  it("one run: null progress output first, then one output per segment", () => {
    const args = buildSegmentExportArgs("in.mp3", keep, 60, names);
    expect(args.slice(0, 2)).toEqual(["-i", "in.mp3"]);
    expect(args.slice(4, 11)).toEqual(["-map", "0:a:0", "-c", "copy", "-f", "null", "-"]);
    expect(graph(args)).toBe(
      "[0:a:0]atrim=end=10.000000,asetpts=PTS-STARTPTS,afade=t=out:st=9.988000:d=0.012000[o0];" +
      "[0:a:0]atrim=start=20.000000:end=40.000000,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.012000,afade=t=out:st=19.988000:d=0.012000[o1];" +
      "[0:a:0]atrim=start=50.000000,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.012000[o2]"
    );
    const enc = ["-c:a", "libmp3lame", "-q:a", "2", "-ar", "44100", "-f", "mp3"];
    expect(args.slice(11)).toEqual([
      "-map", "[o0]", ...enc, "-y", "seg-01.mp3",
      "-map", "[o1]", ...enc, "-y", "seg-02.mp3",
      "-map", "[o2]", ...enc, "-y", "seg-03.mp3",
    ]);
  });

  it("applies normalize and fades per file, using each segment's length", () => {
    const g = graph(buildSegmentExportArgs("in.mp3", keep, 60, names, { normalize: true, fade: { outSec: 1 } }));
    expect(g).toContain("loudnorm=I=-16:TP=-1.5:LRA=11,asetpts=PTS-STARTPTS,afade=t=out:st=9.000000:d=1.000000[o0]");
    expect(g).toContain("afade=t=out:st=19.000000:d=1.000000[o1]");
  });

  it("uses anull for an untouched single segment", () => {
    expect(graph(buildSegmentExportArgs("in.mp3", [seg(0, 60)], 60, ["a.wav"], { format: "wav" }))).toBe("[0:a:0]anull[o0]");
  });

  it("validates its input", () => {
    expect(() => buildSegmentExportArgs("in.mp3", [], 60, [])).toThrow(/Nothing to export/);
    expect(() => buildSegmentExportArgs("in.mp3", keep, 60, ["a.mp3"])).toThrow(/one output name per segment/);
  });
});

describe("buildSilenceDetectArgs", () => {
  it("runs silencedetect into the null muxer", () => {
    expect(buildSilenceDetectArgs("in.wav", { thresholdDb: -40, minSilenceSec: 0.7 })).toEqual([
      "-i", "in.wav", "-map", "0:a:0", "-af", "silencedetect=noise=-40dB:d=0.7", "-f", "null", "-",
    ]);
  });
});

describe("segmentNumber", () => {
  it("pads to two digits, more when needed", () => {
    expect(segmentNumber(0, 3)).toBe("01");
    expect(segmentNumber(9, 12)).toBe("10");
    expect(segmentNumber(4, 150)).toBe("005");
  });
});
