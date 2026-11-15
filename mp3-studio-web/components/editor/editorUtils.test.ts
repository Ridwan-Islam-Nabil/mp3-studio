import { describe, expect, it } from "vitest";
import {
  ZOOM_MAX, baseName, calibrateZoomMin, fileFormat, fileSizeMb, fmt, fmtZoom, sliderToZoom,
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
