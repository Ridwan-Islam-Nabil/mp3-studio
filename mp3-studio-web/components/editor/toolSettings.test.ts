import { describe, expect, it } from "vitest";
import { invertRegions, keepToCuts } from "@/lib/audio/regions";
import type { StorageLike } from "./session";
import {
  DEFAULT_TOOL_SETTINGS, RINGTONE_FADE, TOOLS_STORAGE_KEY,
  applySilence, cutsForExport, effectiveFade, exportOptionsFor, initialModeForLink, keptLength,
  keptSegments, loadToolSettings, outputFileName, outputFormat, regionsForModeSwitch,
  ringtoneTooLong, saveToolSettings, sectionCuts, sectionFileName, settingsForLink,
  type ToolSettings,
} from "./toolSettings";

class FakeStorage implements StorageLike {
  map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}
const broken: StorageLike = {
  get length(): number { throw new Error("denied"); },
  key() { throw new Error("denied"); },
  getItem() { throw new Error("denied"); },
  setItem() { throw new Error("denied"); },
  removeItem() { throw new Error("denied"); },
};

const S = (patch: Partial<ToolSettings> = {}): ToolSettings => ({ ...DEFAULT_TOOL_SETTINGS, ...patch });

describe("defaults", () => {
  it("export exactly like before the Tools panel: MP3, standard quality, no normalize, no fades", () => {
    expect(DEFAULT_TOOL_SETTINGS).toMatchObject({ format: "mp3", quality: "standard", normalize: false, fadeIn: false, fadeOut: false, ringtone: null });
    expect(exportOptionsFor(S())).toEqual({ format: "mp3", quality: "standard" });
  });
});

describe("persistence", () => {
  it("loads defaults from empty, missing, broken or corrupt storage", () => {
    expect(loadToolSettings(null)).toEqual(DEFAULT_TOOL_SETTINGS);
    expect(loadToolSettings(broken)).toEqual(DEFAULT_TOOL_SETTINGS);
    const s = new FakeStorage();
    expect(loadToolSettings(s)).toEqual(DEFAULT_TOOL_SETTINGS);
    s.setItem(TOOLS_STORAGE_KEY, "{not json");
    expect(loadToolSettings(s)).toEqual(DEFAULT_TOOL_SETTINGS);
  });

  it("saves only the changed persisted keys and merges them into what is stored", () => {
    const s = new FakeStorage();
    expect(saveToolSettings(s, { format: "wav" })).toBe(true);
    expect(saveToolSettings(s, { normalize: true, fadeIn: true, fadeInSec: 1 })).toBe(true);
    expect(loadToolSettings(s)).toEqual(S({ format: "wav", normalize: true, fadeIn: true, fadeInSec: 1 }));
    expect(JSON.parse(s.getItem(TOOLS_STORAGE_KEY)!).v).toBe(1);
  });

  it("never stores ringtone mode, invalid values or m4r", () => {
    const s = new FakeStorage();
    expect(saveToolSettings(s, { ringtone: "iphone" })).toBe(false);
    saveToolSettings(s, { format: "m4r" as never, fadeInSec: -1, fadeOutSec: 99, quality: "ultra" as never });
    expect(loadToolSettings(s)).toEqual(DEFAULT_TOOL_SETTINGS);
    s.setItem(TOOLS_STORAGE_KEY, JSON.stringify({ format: "flac", normalize: "yes", ringtone: "iphone" }));
    expect(loadToolSettings(s)).toEqual(DEFAULT_TOOL_SETTINGS);
  });

  it("swallows storage errors", () => {
    expect(saveToolSettings(broken, { format: "wav" })).toBe(false);
    expect(saveToolSettings(null, { format: "wav" })).toBe(false);
  });
});

describe("tool links", () => {
  const stored = S({ format: "m4a", normalize: false });
  it("override the stored settings for the tool they name", () => {
    expect(settingsForLink(stored, null)).toBe(stored);
    expect(settingsForLink(stored, { tool: "normalize" }).normalize).toBe(true);
    expect(settingsForLink(stored, { tool: "ringtone", device: "iphone" }).ringtone).toBe("iphone");
    expect(settingsForLink(stored, { tool: "ringtone", device: "android" }).ringtone).toBe("android");
    expect(settingsForLink(stored, { tool: "convert", format: "wav" }).format).toBe("wav");
    expect(settingsForLink(stored, { tool: "convert" }).format).toBe("m4a");
    expect(settingsForLink(stored, { tool: "split" })).toEqual(stored);
    expect(settingsForLink(stored, { tool: "remove-silence" })).toEqual(stored);
  });
  it("keep → keep mode, everything else cut mode", () => {
    expect(initialModeForLink({ tool: "keep" })).toBe("keep");
    expect(initialModeForLink({ tool: "split" })).toBe("cut");
    expect(initialModeForLink(null)).toBe("cut");
  });
});

describe("export options", () => {
  it("ringtone mode sets the format: iPhone M4R, Android MP3", () => {
    expect(outputFormat(S({ format: "wav" }))).toBe("wav");
    expect(outputFormat(S({ format: "wav", ringtone: "iphone" }))).toBe("m4r");
    expect(outputFormat(S({ format: "wav", ringtone: "android" }))).toBe("mp3");
  });
  it("WAV has no quality; normalize and fades are passed through", () => {
    expect(exportOptionsFor(S({ format: "wav", quality: "high" }))).toEqual({ format: "wav" });
    expect(exportOptionsFor(S({ format: "m4a", quality: "high", normalize: true }))).toEqual({ format: "m4a", quality: "high", normalize: true });
    expect(exportOptionsFor(S({ fadeIn: true, fadeInSec: 3 }))).toMatchObject({ fade: { inSec: 3 } });
    expect(exportOptionsFor(S({ fadeOut: true, fadeOutSec: 1 })).fade).toEqual({ outSec: 1 });
  });
  it("ringtone adds short fades; a longer user fade wins", () => {
    expect(effectiveFade(S({ ringtone: "android" }))).toEqual(RINGTONE_FADE);
    expect(effectiveFade(S({ ringtone: "iphone", fadeOut: true, fadeOutSec: 3 }))).toEqual({ inSec: RINGTONE_FADE.inSec, outSec: 3 });
    expect(effectiveFade(S({ fadeIn: false, fadeInSec: 5 }))).toEqual({ inSec: 0, outSec: 0 });
    expect(exportOptionsFor(S({ ringtone: "iphone" }))).toEqual({ format: "m4r", quality: "standard", fade: { inSec: 0.5, outSec: 1 } });
  });
  it("file names get the right extension", () => {
    expect(outputFileName("song", "wav")).toBe("song.wav");
    expect(outputFileName("  ", "m4r")).toBe("output.m4r");
    expect(sectionFileName("talk", 0, 3, "mp3")).toBe("talk-01.mp3");
    expect(sectionFileName("talk", 11, 120, "m4a")).toBe("talk-012.m4a");
  });
});

describe("keep mode", () => {
  const d = 60;
  it("cut mode exports the regions as cuts; keep mode exports their complement", () => {
    const r = [{ start: 10, end: 20 }];
    expect(cutsForExport(r, d, "cut")).toEqual(r);
    expect(cutsForExport(r, d, "keep")).toEqual(keepToCuts(r, d));
    expect(keptSegments(r, d, "keep")).toEqual([{ start: 10, end: 20 }]);
    expect(keptLength(r, d, "keep")).toBe(10);
    expect(keptLength(r, d, "cut")).toBe(50);
    expect(keptLength([], d, "cut")).toBe(60);
    expect(keptLength([], d, "keep")).toBe(0);
    expect(keptSegments(r, 0, "cut")).toEqual([]);
  });
  it("cutsForExport strips extra fields (ids, WaveSurfer refs)", () => {
    expect(cutsForExport([{ id: "x", start: 1, end: 2 } as never], d, "cut")).toEqual([{ start: 1, end: 2 }]);
  });
  it("converting on a mode switch keeps the exported result the same", () => {
    const cuts = [{ start: 10, end: 20 }, { start: 40, end: 50 }];
    const keep = regionsForModeSwitch(cuts, d, "keep", "convert");
    expect(keep).toEqual([{ start: 0, end: 10 }, { start: 20, end: 40 }, { start: 50, end: 60 }]);
    expect(keptSegments(keep, d, "keep")).toEqual(keptSegments(cuts, d, "cut"));
    expect(regionsForModeSwitch(keep, d, "cut", "convert")).toEqual(cuts);
  });
  it("relabel keeps the same ranges", () => {
    const r = [{ start: 1, end: 2 }];
    expect(regionsForModeSwitch(r, d, "keep", "relabel")).toEqual(r);
  });
});

describe("applySilence", () => {
  const d = 30;
  const silences = [{ start: 0, end: 2 }, { start: 10, end: 12 }, { start: 28, end: 30 }];

  it("cut mode adds the silences as cuts, skipping ones already inside a cut", () => {
    expect(applySilence([], silences, d, "cut")).toEqual({ kind: "add", ranges: silences, count: 3 });
    const res = applySilence([{ start: 9, end: 13 }], silences, d, "cut");
    expect(res).toEqual({ kind: "add", ranges: [silences[0], silences[2]], count: 2 });
  });

  it("keep mode with no keep regions keeps everything except the silences", () => {
    const res = applySilence([], silences, d, "keep");
    expect(res.kind).toBe("replace");
    expect(res.count).toBe(3);
    expect(res.ranges).toEqual(invertRegions(silences, d));
  });

  it("keep mode removes silences from the keep regions; untouched regions stay", () => {
    const res = applySilence([{ start: 5, end: 15 }, { start: 20, end: 25 }], silences, d, "keep");
    expect(res.count).toBe(1);
    expect(res.ranges).toEqual([{ start: 5, end: 10 }, { start: 12, end: 15 }, { start: 20, end: 25 }]);
    const none = applySilence([{ start: 20, end: 25 }], silences, d, "keep");
    expect(none).toEqual({ kind: "replace", ranges: [{ start: 20, end: 25 }], count: 0 });
  });
});

describe("ringtone length", () => {
  it("warns only for iPhone above 40 s", () => {
    expect(ringtoneTooLong(S({ ringtone: "iphone" }), 40)).toBe(false);
    expect(ringtoneTooLong(S({ ringtone: "iphone" }), 40.5)).toBe(true);
    expect(ringtoneTooLong(S({ ringtone: "android" }), 300)).toBe(false);
    expect(ringtoneTooLong(S(), 300)).toBe(false);
  });
});

describe("sectionCuts", () => {
  it("leaves only the section", () => {
    expect(sectionCuts({ start: 5, end: 8 }, 10)).toEqual([{ start: 0, end: 5 }, { start: 8, end: 10 }]);
    expect(invertRegions(sectionCuts({ start: 0, end: 10 }, 10), 10)).toEqual([{ start: 0, end: 10 }]);
  });
});
