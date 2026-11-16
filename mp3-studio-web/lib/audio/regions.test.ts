/**
 * Tests for the pure region helpers.
 *
 * invertRegions — turns CUT regions (parts to delete) into KEEP segments.
 * Mirrors the local app's tests in ../../../tests/test_invert_regions.py.
 * Differences from the Python version (by design, not bugs):
 *   - the minimum keep-segment length is 0.01 s here vs 0.05 s in app.py
 *   - values are not rounded
 *
 * keepToCuts — keep mode, the inverse of invertRegions (round trip tested).
 */
import { describe, expect, it } from "vitest";
import { invertRegions, keepToCuts, mergeRegions, totalLength, type CutRegion } from "./regions";

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

describe("keepToCuts", () => {
  it("cuts everything outside the keep regions", () => {
    expect(keepToCuts(keeps([5, 15], [30, 40]), 60)).toEqual(cuts([0, 5], [15, 30], [40, 60]));
  });

  it("cuts the whole file when nothing is kept", () => {
    expect(keepToCuts([], 60)).toEqual(cuts([0, 60]));
  });

  it("cuts nothing when the whole file is kept", () => {
    expect(keepToCuts(keeps([0, 60]), 60)).toEqual([]);
  });

  it("does not cut before a region starting at 0 or after one ending at the end", () => {
    expect(keepToCuts(keeps([0, 10], [50, 60]), 60)).toEqual(cuts([10, 50]));
  });

  it("merges overlapping and unsorted keep regions", () => {
    expect(keepToCuts(keeps([30, 40], [8, 20], [5, 10]), 60)).toEqual(cuts([0, 5], [20, 30], [40, 60]));
  });

  it("clamps keep regions that extend past the audio", () => {
    expect(keepToCuts(keeps([-3, 10], [50, 90]), 60)).toEqual(cuts([10, 50]));
  });

  it("drops tiny gaps between keep regions", () => {
    expect(keepToCuts(keeps([0, 10], [10.005, 60]), 60)).toEqual([]);
  });

  it("does not mutate its input", () => {
    const input = keeps([30, 40], [5, 10]);
    const snapshot = structuredClone(input);
    keepToCuts(input, 60);
    expect(input).toEqual(snapshot);
  });

  describe("round trip with invertRegions", () => {
    const cases: [string, [number, number][]][] = [
      ["one region", [[10, 20]]],
      ["several regions", [[0, 5], [12.5, 30], [44.4, 60]]],
      ["regions touching both ends", [[0, 1], [59, 60]]],
      ["many short regions", Array.from({ length: 20 }, (_, i) => [i * 3, i * 3 + 1.5] as [number, number])],
    ];

    it.each(cases)("keep → cuts → keep returns %s unchanged", (_, pairs) => {
      const keep = keeps(...pairs);
      expect(invertRegions(keepToCuts(keep, 60), 60)).toEqual(keep);
    });

    it.each(cases)("cuts → keep → cuts returns %s unchanged", (_, pairs) => {
      const cut = cuts(...pairs);
      expect(keepToCuts(invertRegions(cut, 60), 60)).toEqual(cut);
    });

    it("keeping the whole file round-trips through zero cuts", () => {
      expect(keepToCuts(keeps([0, 60]), 60)).toEqual([]);
      expect(invertRegions([], 60)).toEqual(keeps([0, 60]));
    });

    it("normalizes overlapping, unsorted input", () => {
      const keep = keeps([30, 40], [5, 20], [15, 25]);
      expect(invertRegions(keepToCuts(keep, 60), 60)).toEqual(keeps([5, 25], [30, 40]));
    });
  });
});

describe("mergeRegions", () => {
  it("sorts, clamps, drops empty and merges overlapping or touching ranges", () => {
    expect(mergeRegions(cuts([50, 70], [5, 10], [10, 12], [20, 20], [-1, 2], [8, 9]), 60)).toEqual(
      cuts([0, 2], [5, 12], [50, 60])
    );
  });

  it("returns [] for no ranges", () => {
    expect(mergeRegions([], 60)).toEqual([]);
  });
});

describe("totalLength", () => {
  it("sums segment lengths", () => {
    expect(totalLength(keeps([0, 10], [20, 25.5]))).toBeCloseTo(15.5);
    expect(totalLength([])).toBe(0);
  });
});
