import { describe, expect, it } from "vitest";
import { shortcutFor, targetKind, type KeyInput } from "./shortcuts";

const k = (key: string, extra: Partial<KeyInput> = {}): KeyInput => ({
  key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, target: "other", ...extra,
});

describe("shortcutFor", () => {
  it("maps the plain keys", () => {
    expect(shortcutFor(k(" "))).toBe("togglePlay");
    expect(shortcutFor(k("n"))).toBe("markCut");
    expect(shortcutFor(k("N"))).toBe("markCut"); // Caps Lock
    expect(shortcutFor(k("p"))).toBe("preview");
    expect(shortcutFor(k("f"))).toBe("toggleFullscreen");
    expect(shortcutFor(k("l"))).toBe("stopLoop");
    expect(shortcutFor(k("?", { shiftKey: true }))).toBe("showShortcuts");
    expect(shortcutFor(k("ArrowLeft"))).toBe("skipBack");
    expect(shortcutFor(k("ArrowRight"))).toBe("skipForward");
    expect(shortcutFor(k("Escape"))).toBe("escape");
  });

  it("maps undo / redo with Ctrl or ⌘", () => {
    expect(shortcutFor(k("z", { ctrlKey: true }))).toBe("undo");
    expect(shortcutFor(k("z", { metaKey: true }))).toBe("undo");
    expect(shortcutFor(k("y", { ctrlKey: true }))).toBe("redo");
    expect(shortcutFor(k("Z", { ctrlKey: true, shiftKey: true }))).toBe("redo");
    expect(shortcutFor(k("Z", { metaKey: true, shiftKey: true }))).toBe("redo");
  });

  it("leaves other browser shortcuts alone", () => {
    for (const key of ["p", "f", "n", "l", "r", "s", "a", "c", "v", "x", "t", "w"]) {
      expect(shortcutFor(k(key, { ctrlKey: true })), `Ctrl+${key}`).toBeNull();
      expect(shortcutFor(k(key, { metaKey: true })), `⌘+${key}`).toBeNull();
    }
    expect(shortcutFor(k("ArrowLeft", { altKey: true }))).toBeNull();   // browser back
    expect(shortcutFor(k("ArrowRight", { metaKey: true }))).toBeNull(); // Mac forward
    expect(shortcutFor(k("ArrowLeft", { shiftKey: true }))).toBeNull();
    expect(shortcutFor(k("z", { ctrlKey: true, altKey: true }))).toBeNull();
    expect(shortcutFor(k("y", { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(shortcutFor(k("n", { altKey: true }))).toBeNull();
    expect(shortcutFor(k("N", { shiftKey: true }))).toBeNull();
    expect(shortcutFor(k("F5"))).toBeNull();
    expect(shortcutFor(k("Tab"))).toBeNull();
    expect(shortcutFor(k("Enter"))).toBeNull();
  });

  it("ignores everything but Esc while typing", () => {
    const text = { target: "text" as const };
    for (const key of [" ", "n", "p", "f", "l", "?", "ArrowLeft", "ArrowRight"]) {
      expect(shortcutFor(k(key, text)), key).toBeNull();
    }
    expect(shortcutFor(k("z", { ...text, ctrlKey: true }))).toBeNull(); // the field's own undo
    expect(shortcutFor(k("Escape", text))).toBe("escape");
  });

  it("lets range sliders keep their arrow keys", () => {
    expect(shortcutFor(k("ArrowLeft", { target: "range" }))).toBeNull();
    expect(shortcutFor(k("ArrowRight", { target: "range" }))).toBeNull();
    expect(shortcutFor(k(" ", { target: "range" }))).toBe("togglePlay");
  });

  it("ignores key repeat for one-shot actions but not for skip / undo", () => {
    const repeat = { repeat: true };
    for (const key of [" ", "n", "p", "f", "l", "?", "Escape"]) expect(shortcutFor(k(key, repeat)), key).toBeNull();
    expect(shortcutFor(k("ArrowRight", repeat))).toBe("skipForward");
    expect(shortcutFor(k("z", { ...repeat, ctrlKey: true }))).toBe("undo");
  });
});

describe("targetKind", () => {
  it("classifies focused elements", () => {
    expect(targetKind(null)).toBe("other");
    expect(targetKind({ tagName: "BODY" })).toBe("other");
    expect(targetKind({ tagName: "BUTTON" })).toBe("other");
    expect(targetKind({ tagName: "INPUT", type: "text" })).toBe("text");
    expect(targetKind({ tagName: "INPUT" })).toBe("text");
    expect(targetKind({ tagName: "INPUT", type: "search" })).toBe("text");
    expect(targetKind({ tagName: "INPUT", type: "range" })).toBe("range");
    expect(targetKind({ tagName: "INPUT", type: "checkbox" })).toBe("other");
    expect(targetKind({ tagName: "TEXTAREA" })).toBe("text");
    expect(targetKind({ tagName: "SELECT" })).toBe("text");
    expect(targetKind({ tagName: "DIV", isContentEditable: true })).toBe("text");
  });
});
