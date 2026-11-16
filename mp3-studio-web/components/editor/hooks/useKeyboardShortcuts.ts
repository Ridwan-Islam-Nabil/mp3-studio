/**
 * Global keyboard shortcuts for the editor: one window `keydown` listener that maps keys with
 * `shortcutFor()` (shortcuts.ts — the rules for text fields, sliders and browser shortcuts
 * live there) and calls `onAction` with the result.
 *
 * - Keys a focused element already handled (preventDefault, e.g. Esc in the region time
 *   editor) are skipped.
 * - preventDefault is called only for keys that map to an action the caller handled
 *   (`onAction` returns true), so e.g. Space doesn't also scroll the page or click the focused
 *   button, while unhandled keys keep their browser behavior.
 * - `onAction` is wrapped in useEffectEvent: the listener is registered once and always calls
 *   the latest handler.
 */

import { useEffect, useEffectEvent } from "react";
import { shortcutFor, targetKind, type ShortcutAction } from "../shortcuts";

/** Return true if the action was handled (the key's default is then prevented). */
export type ShortcutHandler = (action: ShortcutAction, e: KeyboardEvent) => boolean;

export function useKeyboardShortcuts(onAction: ShortcutHandler) {
  const handle = useEffectEvent((action: ShortcutAction, e: KeyboardEvent) => onAction(action, e));

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const target = e.target instanceof Element ? (e.target as HTMLElement) : null;
      const kind = targetKind(target);
      const action = shortcutFor({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        repeat: e.repeat,
        target: kind,
      });
      if (action && handle(action, e)) e.preventDefault();
      // Holding Space: only the first press toggles, but the repeats must not scroll the page.
      else if (e.key === " " && e.repeat && kind !== "text" && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
