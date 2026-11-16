/**
 * lib/audio/regions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure time-range helpers (no FFmpeg, no DOM). All times are in seconds.
 *
 * The editor's convention is "cut regions = parts to DELETE". Everything here
 * converts between the three ways of describing an edit:
 *   - cut regions   (what the user marked to remove)
 *   - keep segments (what ends up in the output; what the arg builders consume)
 *   - keep regions  ("keep mode": the user marks what to KEEP instead)
 * Cut → keep is `invertRegions()`, keep → cut is `keepToCuts()`. Both are the
 * same complement operation, so a keep-mode UI can convert once and reuse the
 * normal export path unchanged.
 */

/** A section to REMOVE from the audio. */
export interface CutRegion {
  start: number; // seconds
  end: number;   // seconds
}

/** A section that ends up in the output (in source-file time). */
export interface KeepSegment {
  start: number;
  end: number;
}

/** A section the user marked to KEEP (keep mode). Same shape as a cut. */
export type KeepRegion = KeepSegment;

/** Any `{ start, end }` time range. */
export type TimeRange = { start: number; end: number };

/**
 * Gaps shorter than this between regions (or between a region and the file
 * start/end) are dropped instead of producing a sliver segment.
 */
export const MIN_SEGMENT_SEC = 0.01;

/**
 * Clamps ranges to [0, duration], drops empty ones, sorts them and merges
 * overlapping or touching ones. Does not mutate its input.
 */
export function mergeRegions<T extends TimeRange>(ranges: readonly T[], duration: number): TimeRange[] {
  const sorted = ranges
    .map((r) => ({ start: Math.max(0, r.start), end: Math.min(duration, r.end) }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);

  const merged: TimeRange[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

/**
 * The parts of [0, duration] NOT covered by `ranges`, skipping gaps of
 * MIN_SEGMENT_SEC or less.
 */
function complement(ranges: readonly TimeRange[], duration: number): TimeRange[] {
  const out: TimeRange[] = [];
  let cursor = 0;
  for (const r of mergeRegions(ranges, duration)) {
    if (r.start > cursor + MIN_SEGMENT_SEC) out.push({ start: cursor, end: r.start });
    cursor = Math.max(cursor, r.end);
  }
  if (cursor < duration - MIN_SEGMENT_SEC) out.push({ start: cursor, end: duration });
  return out;
}

/**
 * Inverts cut regions to find which parts of the audio to keep.
 * Example: audio is 60s, cuts are [10-20, 40-50] → keep [0-10, 20-40, 50-60].
 *
 * Cuts may be unsorted, overlapping, nested or extend past the audio. With no
 * cuts the whole file is one segment; when everything is cut the result is [].
 */
export function invertRegions(cuts: CutRegion[], duration: number): KeepSegment[] {
  if (cuts.length === 0) return [{ start: 0, end: duration }];
  return complement(cuts, duration);
}

/**
 * Keep mode: converts regions the user wants to KEEP into the equivalent cut
 * regions, so the result can go straight into `trimAndExport()` / `exportAudio()`
 * / `exportSegments()`.
 *
 * Example: audio is 60s, keep [5-15, 30-40] → cuts [0-5, 15-30, 40-60].
 *
 * With no keep regions the whole file is cut (exporting that throws "Nothing to
 * export"). Overlapping keep regions are merged, and gaps of MIN_SEGMENT_SEC or
 * less between them disappear, so `invertRegions(keepToCuts(k, d), d)` returns
 * `k` sorted and merged.
 */
export function keepToCuts(keepRegions: KeepRegion[], duration: number): CutRegion[] {
  return complement(keepRegions, duration);
}

/** Sum of the lengths of `ranges` (assumed non-overlapping). */
export function totalLength(ranges: readonly TimeRange[]): number {
  return ranges.reduce((sum, r) => sum + Math.max(0, r.end - r.start), 0);
}
