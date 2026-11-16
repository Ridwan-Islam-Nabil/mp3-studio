/**
 * Asked when the user switches between cut and keep mode while regions exist, so the meaning
 * of existing regions never flips silently. Both choices are one undoable step (history.ts
 * records the mode per entry):
 *   - Convert:  regions become their complement — the exported result stays the same
 *   - Relabel:  same time ranges, new meaning (cuts become keep regions or vice versa)
 * Esc (handled by EditorSession), Cancel or a click on the backdrop close it without changes.
 * Portal to document.body, like PreviewModal.
 */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ModeConversion } from "../toolSettings";
import { C, ghostBtn, keepText, primaryBtn } from "../theme";
import type { RegionMode } from "../types";

interface Props {
  to: RegionMode;
  count: number;
  onChoose: (how: ModeConversion) => void;
  onCancel: () => void;
}

export function ModeSwitchDialog({ to, count, onChoose, onCancel }: Props) {
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    firstRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  const toKeep = to === "keep";
  const what = toKeep ? `${count} cut${count === 1 ? "" : "s"}` : `${count} keep region${count === 1 ? "" : "s"}`;

  return createPortal(
    <div onClick={onCancel} data-testid="mode-switch-dialog" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="mode-switch-title" onClick={(e) => e.stopPropagation()}
        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, width: "min(100%, 480px)", padding: 24, boxShadow: C.shadow, color: C.text }}>
        <h2 id="mode-switch-title" style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 800 }}>
          Switch to {toKeep ? <span style={{ color: keepText }}>Keep mode</span> : <span style={{ color: C.cutText }}>Cut mode</span>}?
        </h2>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
          You have {what}. {toKeep
            ? "In Keep mode only the regions you mark are saved."
            : "In Cut mode the regions you mark are removed."} What should happen to them?
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button ref={firstRef} type="button" onClick={() => onChoose("convert")}
            style={primaryBtn({ justifyContent: "flex-start", textAlign: "left", padding: "10px 14px", flexDirection: "column", alignItems: "flex-start", gap: 2 })}>
            <span>Convert the regions</span>
            <span style={{ fontSize: 11.5, fontWeight: 500, opacity: 0.85 }}>
              {toKeep ? "Turn your cuts into the parts they keep." : "Turn your keep regions into the parts they remove."} The result stays the same.
            </span>
          </button>
          <button type="button" onClick={() => onChoose("relabel")}
            style={ghostBtn({ justifyContent: "flex-start", textAlign: "left", padding: "10px 14px", flexDirection: "column", alignItems: "flex-start", gap: 2, color: C.text })}>
            <span>Use the same regions as {toKeep ? "keep regions" : "cuts"}</span>
            <span style={{ fontSize: 11.5, fontWeight: 500, color: C.muted }}>
              {toKeep ? "What you marked to cut is what will be kept." : "What you marked to keep is what will be cut."}
            </span>
          </button>
          <button type="button" onClick={onCancel} style={ghostBtn({ justifyContent: "center" })}>Cancel</button>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 11, color: C.dim }}>Either way, Undo (Ctrl+Z) switches back.</p>
      </div>
    </div>,
    document.body,
  );
}
