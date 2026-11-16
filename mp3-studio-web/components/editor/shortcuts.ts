/**
 * Keyboard shortcuts: which key does what. Pure (no React, no DOM globals) so the mapping is
 * unit-tested in shortcuts.test.ts; hooks/useKeyboardShortcuts.ts listens for keydown and
 * calls `shortcutFor()`, and ui/ShortcutsOverlay.tsx renders `SHORTCUT_LIST`.
 *
 * Rules:
 * - Nothing fires while typing in a text field / textarea / select / contenteditable
 *   ("text" target) — except Esc, so it can still close a modal from its filename input
 *   (a field that handles Esc itself calls preventDefault, which the hook respects).
 * - Arrow keys are left alone on a focused range slider (it uses them natively).
 * - Letter keys and arrows only fire without Ctrl/⌘/Alt, so browser shortcuts
 *   (Ctrl+P print, Ctrl+F find, Alt+← back, …) are never taken over. Only Ctrl/⌘+Z, Ctrl/⌘+Y
 *   and Ctrl/⌘+Shift+Z are used with a modifier.
 * - Delete/Backspace on a focused region row is handled by the row itself (RegionList).
 */

export type ShortcutAction =
  | "togglePlay" | "markCut" | "preview" | "toggleFullscreen" | "showShortcuts"
  | "undo" | "redo" | "skipBack" | "skipForward" | "stopLoop" | "escape";

/** What kind of element has focus when the key is pressed. */
export type TargetKind = "text" | "range" | "other";

export interface KeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  target: TargetKind;
}

/** Input types that don't take typed text (they behave like buttons for shortcuts). */
const NON_TEXT_INPUTS = new Set(["button", "checkbox", "color", "file", "image", "radio", "reset", "submit"]);

/** Classifies a focused element by tag/type/contentEditable (works on any element-like object). */
export function targetKind(el: { tagName?: string; type?: string; isContentEditable?: boolean } | null): TargetKind {
  if (!el || !el.tagName) return "other";
  if (el.isContentEditable) return "text";
  const tag = el.tagName.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return "text";
  if (tag === "INPUT") {
    const type = (el.type ?? "text").toLowerCase();
    if (type === "range") return "range";
    return NON_TEXT_INPUTS.has(type) ? "other" : "text";
  }
  return "other";
}

/** Maps a keydown to an editor action, or null if the editor should not handle it. */
export function shortcutFor(e: KeyInput): ShortcutAction | null {
  if (e.key === "Escape") return e.repeat ? null : "escape";
  if (e.target === "text") return null;

  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (mod) {
    if (e.altKey) return null;
    if (key === "z") return e.shiftKey ? "redo" : "undo";
    if (key === "y" && !e.shiftKey) return "redo";
    return null;
  }
  if (e.altKey) return null;

  if (key === "ArrowLeft" || key === "ArrowRight") {
    if (e.target === "range" || e.shiftKey) return null;
    return key === "ArrowLeft" ? "skipBack" : "skipForward";
  }
  if (e.repeat) return null;
  if (key === "?") return "showShortcuts";
  if (e.shiftKey && key !== " ") return null; // Shift+letter is left to the browser/OS
  switch (key) {
    case " ": return "togglePlay";
    case "n": return "markCut";
    case "p": return "preview";
    case "f": return "toggleFullscreen";
    case "l": return "stopLoop";
    default:  return null;
  }
}

/** Rows of the shortcuts overlay. `sep` joins the keys: "+" = together (default), "/" = either. */
export const SHORTCUT_LIST: { keys: string[]; sep?: "+" | "/"; label: string }[] = [
  { keys: ["Space"], label: "Play / pause" },
  { keys: ["N"], label: "Drop a 10 s cut centered on the playhead" },
  { keys: ["P"], label: "Preview the result" },
  { keys: ["F"], label: "Toggle fullscreen waveform" },
  { keys: ["L"], label: "Stop looping a cut" },
  { keys: ["←", "→"], sep: "/", label: "Skip 5 seconds back / forward" },
  { keys: ["Ctrl/⌘", "Z"], label: "Undo" },
  { keys: ["Ctrl/⌘", "Y"], label: "Redo (also Ctrl/⌘ + Shift + Z)" },
  { keys: ["Delete"], label: "Remove the focused cut in the list" },
  { keys: ["?"], label: "Show this list" },
  { keys: ["Esc"], label: "Close this list / preview, exit fullscreen" },
];
