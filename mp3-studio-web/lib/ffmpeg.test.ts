/**
 * Tests for invertRegions — turns CUT regions (parts to delete) into KEEP segments.
 * Mirrors the local app's tests in ../tests/test_invert_regions.py.
 *
 * Differences from the Python version (by design, not bugs):
 *   - the minimum keep-segment length is 0.01 s here vs 0.05 s in app.py
 *   - values are not rounded
 */
import { describe, expect, it } from "vitest";
import { invertRegions, type CutRegion } from "./ffmpeg";

const cuts = (...pairs: [number, number][]): CutRegion[] => pairs.map(([start, end]) => ({ start, end }));
const keeps = cuts;

describe("invertRegions", () => {
  it("keeps the full file when there are no cuts", () => {
    expect(invertRegions([], 60)).toEqual(keeps([0, 60]));
  });

  it("splits around a single cut in the middle", () => {
    expect(invertRegions(cuts([10, 20]), 60)).toEqual(keeps([0, 10], [20, 60]));
  });

  it("handles the documented example", () => {
    expect(invertRegions(cuts([10, 20], [40, 50]), 60)).toEqual(keeps([0, 10], [20, 40], [50, 60]));
  });

  it("sorts unsorted cuts", () => {
    expect(invertRegions(cuts([40, 50], [10, 20]), 60)).toEqual(keeps([0, 10], [20, 40], [50, 60]));
  });

  it("merges partially overlapping cuts", () => {
    expect(invertRegions(cuts([10, 25], [20, 30]), 60)).toEqual(keeps([0, 10], [30, 60]));
  });

  // BUG: the loop does `cursor = cut.end` instead of `cursor = Math.max(cursor, cut.end)`,
  // so a short cut inside a longer one moves the cursor backwards and part of the longer
  // cut (20–30 here) ends up in the export. app.py merges overlaps first and is correct.
  it("a cut contained in another cut does not re-open a keep segment", () => {
    expect(invertRegions(cuts([10, 30], [15, 20]), 60)).toEqual(keeps([0, 10], [30, 60]));
  });

  it("handles adjacent cuts that touch", () => {
    expect(invertRegions(cuts([10, 20], [20, 30]), 60)).toEqual(keeps([0, 10], [30, 60]));
  });

  it("handles a cut touching the start", () => {
    expect(invertRegions(cuts([0, 15]), 60)).toEqual(keeps([15, 60]));
  });

  it("handles a cut touching the end", () => {
    expect(invertRegions(cuts([50, 60]), 60)).toEqual(keeps([0, 50]));
  });

  it("handles cuts touching both ends", () => {
    expect(invertRegions(cuts([0, 15], [590, 600]), 600)).toEqual(keeps([15, 590]));
  });

  it("keeps nothing when one cut covers everything", () => {
    expect(invertRegions(cuts([0, 60]), 60)).toEqual([]);
  });

  it("handles a cut extending past the duration", () => {
    expect(invertRegions(cuts([50, 75]), 60)).toEqual(keeps([0, 50]));
  });

  it("handles a cut starting before zero", () => {
    expect(invertRegions(cuts([-5, 10]), 60)).toEqual(keeps([10, 60]));
  });

  // BUG (same as app.py): a cut that starts after the end of the audio yields a keep
  // segment ending past `duration`. Harmless with FFmpeg in practice (-to past EOF stops at
  // EOF) and WaveSurfer keeps regions inside the audio.
  it("ignores a cut entirely beyond the duration", () => {
    expect(invertRegions(cuts([70, 80]), 60)).toEqual(keeps([0, 60]));
  });

  it("drops a tiny gap between cuts", () => {
    expect(invertRegions(cuts([10, 20], [20.005, 30]), 60)).toEqual(keeps([0, 10], [30, 60]));
  });

  it("keeps a small gap above the threshold", () => {
    expect(invertRegions(cuts([10, 20], [20.1, 30]), 60)).toEqual(keeps([0, 10], [20, 20.1], [30, 60]));
  });

  it("drops tiny leading and trailing gaps", () => {
    expect(invertRegions(cuts([0.005, 59.995]), 60)).toEqual([]);
  });

  it("does not mutate its input", () => {
    const input = cuts([40, 50], [10, 20]);
    const snapshot = structuredClone(input);
    invertRegions(input, 60);
    expect(input).toEqual(snapshot);
  });
});
