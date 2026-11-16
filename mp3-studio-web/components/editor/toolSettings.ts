/**
 * Tool settings (Tools panel) and the pure helpers behind the editor's audio tools: export
 * options, keep mode, remove silence, ringtone checks, single-section export.
 * No React, no DOM globals — unit-tested in toolSettings.test.ts.
 *
 * Persistence: format, quality, normalize and the fades are remembered in localStorage under
 * TOOLS_STORAGE_KEY (`{ v: 1, ...settings }`). Ringtone mode and keep mode are not (keep mode is
 * remembered per file by the session auto-save). A `?tool=` link (toolParams.ts) overrides the
 * stored settings for that visit only: `saveToolSettings` merges just the keys the user changed
 * into what is stored, so link-applied values are never written unless the user touches them.
 */

import { DEFAULT_FORMAT, IPHONE_RINGTONE_MAX_SEC, withExtension, type OutputFormat, type Quality } from "@/lib/audio/formats";
import type { ExportOptions, FadeOptions } from "@/lib/audio/args";
import {
  invertRegions, keepToCuts, mergeRegions, totalLength,
  type CutRegion, type KeepSegment, type TimeRange,
} from "@/lib/audio/regions";
import { segmentNumber } from "@/lib/audio/args";
import type { StorageLike } from "./session";
import { CONVERT_FORMATS, type ConvertFormat, type RingtoneDevice, type ToolLink } from "./toolParams";
import type { RegionMode } from "./types";

export interface ToolSettings {
  /** Output format when ringtone mode is off. */
  format: ConvertFormat;
  quality: Quality;
  normalize: boolean;
  fadeIn: boolean;
  fadeInSec: number;
  fadeOut: boolean;
  fadeOutSec: number;
  /** Ringtone mode: null = off. Sets the format (iPhone M4R / Android MP3) and short fades. */
  ringtone: RingtoneDevice | null;
}

export const DEFAULT_TOOL_SETTINGS: Readonly<ToolSettings> = {
  format: DEFAULT_FORMAT as ConvertFormat,
  quality: "standard",
  normalize: false,
  fadeIn: false,
  fadeInSec: 2,
  fadeOut: false,
  fadeOutSec: 2,
  ringtone: null,
};

/** Fade lengths offered in the Tools panel (seconds). */
export const FADE_CHOICES = [0.5, 1, 2, 3, 5] as const;

/** Fades ringtone mode adds (a longer user fade wins). */
export const RINGTONE_FADE: Readonly<Required<FadeOptions>> = { inSec: 0.5, outSec: 1 };

export const TOOLS_STORAGE_KEY = "mp3studio-web:tools";

/** Settings remembered across visits. */
export const PERSISTED_KEYS = ["format", "quality", "normalize", "fadeIn", "fadeInSec", "fadeOut", "fadeOutSec"] as const;
type PersistedKey = (typeof PERSISTED_KEYS)[number];
export type PersistedSettings = Pick<ToolSettings, PersistedKey>;

const isFadeSec = (v: unknown): v is number => typeof v === "number" && isFinite(v) && v > 0 && v <= 10;

/** Keeps only valid persisted fields of an unknown value. */
function sanitizePersisted(raw: unknown): Partial<PersistedSettings> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<PersistedSettings> = {};
  if (typeof r.format === "string" && (CONVERT_FORMATS as readonly string[]).includes(r.format)) out.format = r.format as ConvertFormat;
  if (r.quality === "standard" || r.quality === "high") out.quality = r.quality;
  if (typeof r.normalize === "boolean") out.normalize = r.normalize;
  if (typeof r.fadeIn === "boolean") out.fadeIn = r.fadeIn;
  if (typeof r.fadeOut === "boolean") out.fadeOut = r.fadeOut;
  if (isFadeSec(r.fadeInSec)) out.fadeInSec = r.fadeInSec;
  if (isFadeSec(r.fadeOutSec)) out.fadeOutSec = r.fadeOutSec;
  return out;
}

function readStored(storage: StorageLike | null): Partial<PersistedSettings> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(TOOLS_STORAGE_KEY);
    return raw ? sanitizePersisted(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/** Stored settings on top of the defaults (storage missing/broken → defaults). */
export function loadToolSettings(storage: StorageLike | null): ToolSettings {
  return { ...DEFAULT_TOOL_SETTINGS, ...readStored(storage) };
}

/**
 * Merges the persisted keys of `patch` into what is stored (other stored values stay as they
 * are). Returns true if written. Never throws.
 */
export function saveToolSettings(storage: StorageLike | null, patch: Partial<ToolSettings>): boolean {
  if (!storage) return false;
  const changed = sanitizePersisted(patch);
  if (Object.keys(changed).length === 0) return false;
  try {
    storage.setItem(TOOLS_STORAGE_KEY, JSON.stringify({ v: 1, ...readStored(storage), ...changed }));
    return true;
  } catch {
    return false;
  }
}

// ─── Tool links ──────────────────────────────────────────────────────────────

/** The settings a `?tool=` link asks for, on top of `base` (the stored settings). */
export function settingsForLink(base: ToolSettings, link: ToolLink | null): ToolSettings {
  if (!link) return base;
  switch (link.tool) {
    case "normalize": return { ...base, normalize: true };
    case "ringtone":  return { ...base, ringtone: link.device ?? "iphone" };
    case "convert":   return { ...base, ringtone: null, format: link.format ?? base.format };
    default:          return base;
  }
}

/** Keep mode for `?tool=keep`, else the normal cut mode. */
export function initialModeForLink(link: ToolLink | null): RegionMode {
  return link?.tool === "keep" ? "keep" : "cut";
}

// ─── Export options ──────────────────────────────────────────────────────────

/** The format that will actually be written (ringtone mode overrides the picker). */
export function outputFormat(s: ToolSettings): OutputFormat {
  if (s.ringtone === "iphone") return "m4r";
  if (s.ringtone === "android") return "mp3";
  return s.format;
}

/** Fade lengths to apply (0 = none), including the ringtone minimums. */
export function effectiveFade(s: ToolSettings): Required<FadeOptions> {
  let inSec = s.fadeIn ? s.fadeInSec : 0;
  let outSec = s.fadeOut ? s.fadeOutSec : 0;
  if (s.ringtone) {
    inSec = Math.max(inSec, RINGTONE_FADE.inSec);
    outSec = Math.max(outSec, RINGTONE_FADE.outSec);
  }
  return { inSec, outSec };
}

/** ExportOptions for lib/ffmpeg from the Tools panel settings. */
export function exportOptionsFor(s: ToolSettings): ExportOptions {
  const format = outputFormat(s);
  const { inSec, outSec } = effectiveFade(s);
  const options: ExportOptions = { format };
  if (format !== "wav") options.quality = s.quality;
  if (s.normalize) options.normalize = true; // fast two-pass
  if (inSec > 0 || outSec > 0) options.fade = { ...(inSec > 0 ? { inSec } : {}), ...(outSec > 0 ? { outSec } : {}) };
  return options;
}

/** Download name: `name` (or "output") + the format's extension. */
export function outputFileName(name: string, format: OutputFormat): string {
  return withExtension(name.trim() || "output", format);
}

// ─── Keep mode ───────────────────────────────────────────────────────────────

/**
 * The cut regions to hand to the engine. Cut mode: the regions as they are. Keep mode: the
 * complement of the keep regions (`keepToCuts`), so the normal export path works unchanged.
 */
export function cutsForExport(regions: readonly TimeRange[], duration: number, mode: RegionMode): CutRegion[] {
  const ranges = regions.map(({ start, end }) => ({ start, end }));
  return mode === "keep" ? keepToCuts(ranges, duration) : ranges;
}

/** What ends up in the output, in source time (sorted, merged). */
export function keptSegments(regions: readonly TimeRange[], duration: number, mode: RegionMode): KeepSegment[] {
  if (duration <= 0) return [];
  return invertRegions(cutsForExport(regions, duration, mode), duration);
}

/** Length of the output in seconds. */
export function keptLength(regions: readonly TimeRange[], duration: number, mode: RegionMode): number {
  return totalLength(keptSegments(regions, duration, mode));
}

/** How a mode switch treats existing regions. */
export type ModeConversion = "convert" | "relabel";

/**
 * Regions after switching mode. "convert" flips them to their complement, so the exported
 * result stays the same (cuts → the parts they keep, keep regions → the parts they cut);
 * "relabel" keeps the same time ranges with the new meaning.
 */
export function regionsForModeSwitch(
  regions: readonly TimeRange[], duration: number, to: RegionMode, how: ModeConversion,
): TimeRange[] {
  const ranges = regions.map(({ start, end }) => ({ start, end }));
  if (how === "relabel") return ranges;
  // cut → keep: the kept parts; keep → cut: the removed parts.
  return to === "keep" ? invertRegions(ranges, duration) : keepToCuts(ranges, duration);
}

// ─── Remove silence ──────────────────────────────────────────────────────────

/** Overlap below this (seconds) doesn't count. */
const EPS = 0.001;

const overlap = (a: TimeRange, b: TimeRange) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));

export type SilenceResult =
  /** Cut mode: add these cut regions next to the existing ones. */
  | { kind: "add"; ranges: TimeRange[]; count: number }
  /** Keep mode: replace all keep regions with these. */
  | { kind: "replace"; ranges: TimeRange[]; count: number };

/**
 * Applies detected silences (cut regions from `detectSilence()`) to the current regions.
 * - Cut mode: silences become new cut regions; ones already fully inside an existing cut are
 *   skipped. `count` = cuts added.
 * - Keep mode: the silences are removed from the keep regions (no keep regions yet = the whole
 *   file is kept, so the result is "everything except the silences"). `count` = silent parts
 *   that overlapped kept audio.
 */
export function applySilence(
  regions: readonly TimeRange[], silences: readonly TimeRange[], duration: number, mode: RegionMode,
): SilenceResult {
  if (mode === "cut") {
    const ranges = silences
      .map(({ start, end }) => ({ start, end }))
      .filter((s) => !regions.some((r) => r.start <= s.start + EPS && r.end >= s.end - EPS));
    return { kind: "add", ranges, count: ranges.length };
  }
  const base = regions.length > 0 ? mergeRegions(regions, duration) : [{ start: 0, end: duration }];
  const count = silences.filter((s) => base.some((b) => overlap(b, s) > EPS)).length;
  if (count === 0) return { kind: "replace", ranges: base, count: 0 };
  const cuts = [...keepToCuts(base, duration), ...silences.map(({ start, end }) => ({ start, end }))];
  return { kind: "replace", ranges: invertRegions(cuts, duration), count };
}

// ─── Ringtone ────────────────────────────────────────────────────────────────

/** True when iPhone ringtone mode is on and the output would be longer than iOS accepts. */
export function ringtoneTooLong(s: ToolSettings, keptSec: number): boolean {
  return s.ringtone === "iphone" && keptSec > IPHONE_RINGTONE_MAX_SEC + 0.005;
}

// ─── Export one section ──────────────────────────────────────────────────────

/** Cuts that leave only `section` of the file. */
export function sectionCuts(section: TimeRange, duration: number): CutRegion[] {
  return keepToCuts([{ start: section.start, end: section.end }], duration);
}

/** `<name>-01.mp3`, `-02`, … numbered by position (same scheme as exportSegments). */
export function sectionFileName(name: string, index: number, count: number, format: OutputFormat): string {
  return withExtension(`${name.trim() || "output"}-${segmentNumber(index, count)}`, format);
}

// ─── Analytics ───────────────────────────────────────────────────────────────

/** The output settings added to export analytics events (no file names, no personal data). */
export function outputAnalytics(s: ToolSettings, mode: RegionMode) {
  const fade = effectiveFade(s);
  return {
    format: outputFormat(s),
    normalize: s.normalize,
    mode,
    fade: fade.inSec > 0 || fade.outSec > 0,
    ringtone: s.ringtone,
  };
}
