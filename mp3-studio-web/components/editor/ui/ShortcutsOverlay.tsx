/**
 * "Keyboard shortcuts" overlay, opened with `?` or the ⌨ button in the waveform header.
 * Lists SHORTCUT_LIST from shortcuts.ts. Esc (handled by EditorSession), the × button or a
 * click on the backdrop close it. Focus moves to the close button on open and goes back to
 * whatever had it on close.
 *
 * Portal to document.body, like PreviewModal, so it sits above fullscreen and the editor.
 */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { SHORTCUT_LIST } from "../shortcuts";
import { C } from "../theme";

const kbd: React.CSSProperties = {
  display: "inline-block", minWidth: 22, textAlign: "center", padding: "2px 7px",
  background: C.surface, border: `1px solid ${C.border}`, borderBottomWidth: 2, borderRadius: 6,
  fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: C.text, whiteSpace: "nowrap",
};

export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => previous?.focus();
  }, []);

  return createPortal(
    <div onClick={onClose} data-testid="shortcuts-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" onClick={(e) => e.stopPropagation()}
        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, width: "min(92vw,520px)", maxHeight: "85vh", overflowY: "auto", padding: 28, boxShadow: C.shadow, color: C.text }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 id="shortcuts-title" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Keyboard shortcuts</h2>
          <button ref={closeRef} onClick={onClose} aria-label="Close keyboard shortcuts"
            style={{ background: "none", border: "none", color: C.muted, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <tbody>
            {SHORTCUT_LIST.map(({ keys, sep = "+", label }) => (
              <tr key={label} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ padding: "8px 12px 8px 0", whiteSpace: "nowrap", verticalAlign: "top" }}>
                  {keys.map((k, i) => (
                    <span key={k}>
                      {i > 0 && <span style={{ color: C.dim, margin: "0 4px" }}>{sep}</span>}
                      <kbd style={kbd}>{k}</kbd>
                    </span>
                  ))}
                </td>
                <td style={{ padding: "8px 0", color: C.muted }}>{label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ margin: "14px 0 0", fontSize: 11, color: C.dim, lineHeight: 1.6 }}>
          Shortcuts are off while you type in a text field. Click a time in the cut list to type it
          (<code>M:SS.mmm</code>), Enter to apply, Esc to cancel.
        </p>
      </div>
    </div>,
    document.body,
  );
}
