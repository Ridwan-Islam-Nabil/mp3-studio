import { describe, expect, it } from "vitest";
import { errorLines, parseInputDuration, parseLogTime } from "./log";

describe("parseLogTime", () => {
  it("reads the stats time field", () => {
    expect(parseLogTime("size=N/A time=00:03:00.00 bitrate=N/A speed= 668x    ")).toBe(180);
    expect(parseLogTime("size=  512kB time=01:02:03.45 bitrate=192.0kbits/s")).toBeCloseTo(3723.45);
  });

  it("returns null without a time or with N/A", () => {
    expect(parseLogTime("time=N/A bitrate=N/A")).toBeNull();
    expect(parseLogTime("Stream mapping:")).toBeNull();
  });
});

describe("parseInputDuration", () => {
  it("reads the input header duration", () => {
    expect(parseInputDuration("Input #0, mp3, from 'in.mp3':\n  Duration: 00:03:00.04, start: 0.025057, bitrate: 97 kb/s")).toBeCloseTo(180.04);
  });

  it("returns null for N/A or no header", () => {
    expect(parseInputDuration("  Duration: N/A, start: 0.000000, bitrate: 705 kb/s")).toBeNull();
    expect(parseInputDuration("")).toBeNull();
  });
});

describe("errorLines", () => {
  it("keeps the last lines that look like errors", () => {
    const lines = ["Stream mapping:", "Error opening output file", "x", "Invalid argument", "Conversion failed!", "y"];
    expect(errorLines(lines)).toEqual(["Error opening output file", "Invalid argument", "Conversion failed!"]);
    expect(errorLines(lines, 1)).toEqual(["Conversion failed!"]);
  });
});
