import { describe, expect, it } from "vitest";
import {
  MIN_CUT_SECONDS, ZOOM_MAX, baseName, calibrateZoomMin, fileFormat, fileSizeMb, fmt, fmtPrecise, fmtZoom,
  parseTime, resolveTimeEdit, sliderToZoom,
} from "./editorUtils";

describe("fmt", () => {
  it("formats m:ss.d", () => {
    expect(fmt(0)).toBe("0:00.0");
    expect(fmt(5.25)).toBe("0:05.2");
    expect(fmt(75.99)).toBe("1:15.9");
    expect(fmt(3600)).toBe("60:00.0");
  });
  it("falls back to 0:00.0 for negative or non-finite input", () => {
    expect(fmt(-1)).toBe("0:00.0");
    expect(fmt(NaN)).toBe("0:00.0");
    expect(fmt(Infinity)).toBe("0:00.0");
  });
});

describe("zoom scale", () => {
  it("maps slider 0 to zoomMin and 100 to ZOOM_MAX", () => {
    expect(sliderToZoom(0, 20)).toBe(20);
    expect(sliderToZoom(100, 20)).toBe(ZOOM_MAX);
  });
  it("is logarithmic (midpoint is the geometric mean)", () => {
    expect(sliderToZoom(50, 20)).toBe(Math.round(Math.sqrt(20 * ZOOM_MAX)));
  });
  it("calibrates just above the fit-to-view px/sec, never below 1", () => {
    expect(calibrateZoomMin(1000, 100)).toBe(11);
    expect(calibrateZoomMin(1000, 3)).toBe(335);
    expect(calibrateZoomMin(10, 100000)).toBe(2);
  });
  it("formats the badge", () => {
    expect(fmtZoom(25)).toBe("25×");
    expect(fmtZoom(1500)).toBe("1.5k×");
  });
});

describe("file metadata", () => {
  it("extracts the lower-case extension", () => {
    expect(fileFormat("Song.WAV")).toBe("wav");
    expect(fileFormat(undefined)).toBe("unknown");
  });
  it("rounds the size to 0.1 MB", () => {
    expect(fileSizeMb(1024 * 1024 * 2.26)).toBe(2.3);
  });
  it("strips the extension for the default output name", () => {
    expect(baseName("my.song.mp3")).toBe("my.song");
    expect(baseName(".mp3")).toBe("output");
  });
});

describe("fmtPrecise", () => {
  it("formats M:SS.mmm below an hour", () => {
    expect(fmtPrecise(0)).toBe("0:00.000");
    expect(fmtPrecise(5.25)).toBe("0:05.250");
    expect(fmtPrecise(75.0004)).toBe("1:15.000");
    expect(fmtPrecise(59.9996)).toBe("1:00.000"); // rounds to the millisecond
    expect(fmtPrecise(3599.999)).toBe("59:59.999");
  });
  it("formats H:MM:SS.mmm from an hour on", () => {
    expect(fmtPrecise(3600)).toBe("1:00:00.000");
    expect(fmtPrecise(3723.5)).toBe("1:02:03.500");
  });
  it("falls back to 0:00.000 for negative or non-finite input", () => {
    expect(fmtPrecise(-1)).toBe("0:00.000");
    expect(fmtPrecise(NaN)).toBe("0:00.000");
  });
});

describe("parseTime", () => {
  it("accepts SS(.mmm)", () => {
    expect(parseTime("12")).toBe(12);
    expect(parseTime("12.5")).toBe(12.5);
    expect(parseTime("90.125")).toBe(90.125); // plain seconds may exceed 59
    expect(parseTime(".5")).toBe(0.5);
    expect(parseTime("3.")).toBe(3);
  });
  it("accepts M:SS(.mmm)", () => {
    expect(parseTime("1:15.250")).toBeCloseTo(75.25, 9);
    expect(parseTime("0:05")).toBe(5);
    expect(parseTime("75:00")).toBe(4500); // minutes may exceed 59 without an hours field
  });
  it("accepts H:MM:SS(.mmm)", () => {
    expect(parseTime("1:02:03.5")).toBeCloseTo(3723.5, 9);
    expect(parseTime("0:00:01")).toBe(1);
  });
  it("trims whitespace", () => {
    expect(parseTime("  1:00.5 ")).toBeCloseTo(60.5, 9);
  });
  it("round-trips fmtPrecise", () => {
    for (const s of [0, 0.001, 5.25, 75.999, 3599.5, 3723.125]) {
      expect(parseTime(fmtPrecise(s))).toBeCloseTo(s, 3);
    }
  });
  it("rejects malformed input", () => {
    for (const bad of ["", " ", "abc", "1:2:3:4", "1::2", ":30", "1:", "-5", "1:-5", "1:60", "1:75.5",
      "1:60:00", "1.5:00", "1:2e1", "1,5", "Infinity", "0x10"]) {
      expect(parseTime(bad), bad).toBeNull();
    }
  });
});

describe("resolveTimeEdit", () => {
  const region = { start: 10, end: 20 };
  it("applies a valid start or end", () => {
    expect(resolveTimeEdit(region, "start", 12.3456, 60)).toEqual({ start: 12.346, end: 20 });
    expect(resolveTimeEdit(region, "end", 30, 60)).toEqual({ start: 10, end: 30 });
  });
  it("clamps to [0, duration]", () => {
    expect(resolveTimeEdit(region, "end", 999, 60)).toEqual({ start: 10, end: 60 });
    expect(resolveTimeEdit(region, "start", -3, 60)).toEqual({ start: 0, end: 20 });
  });
  it("requires start < end", () => {
    expect(resolveTimeEdit(region, "start", 20, 60)).toHaveProperty("error");
    expect(resolveTimeEdit(region, "start", 25, 60)).toHaveProperty("error");
    expect(resolveTimeEdit(region, "end", 5, 60)).toHaveProperty("error");
    expect(resolveTimeEdit(region, "end", 10 + MIN_CUT_SECONDS / 2, 60)).toHaveProperty("error");
    expect(resolveTimeEdit(region, "end", 10 + MIN_CUT_SECONDS, 60)).toEqual({ start: 10, end: 10.01 });
  });
  it("rejects a start clamped onto the end of the file", () => {
    expect(resolveTimeEdit({ start: 50, end: 60 }, "start", 100, 60)).toHaveProperty("error");
  });
  it("rejects non-finite values", () => {
    expect(resolveTimeEdit(region, "end", NaN, 60)).toHaveProperty("error");
  });
});
