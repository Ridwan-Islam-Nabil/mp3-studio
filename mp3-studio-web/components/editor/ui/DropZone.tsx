/** Empty-state upload area: drag-and-drop or click to browse. */

import { useRef, useState } from "react";
import { AUDIO_ACCEPT } from "../editorUtils";
import { C } from "../theme";

export function DropZone({ onFile }: { onFile: (f: File) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      data-testid="drop-zone"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault(); setDragging(false);
        const f = e.dataTransfer.files[0]; if (f) onFile(f);
      }}
      onClick={() => inputRef.current?.click()}
      style={{ background: dragging ? C.primaryDim : C.card, border: `2px dashed ${dragging ? C.primary : C.border}`, borderRadius: 14, padding: "clamp(40px,8vw,80px) 32px", textAlign: "center", cursor: "pointer", transition: "all .15s", boxShadow: C.shadow }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>🎵</div>
      <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700 }}>Drop your audio file here</h2>
      <p style={{ color: C.muted, margin: "0 0 24px", fontSize: 15 }}>MP3, WAV, M4A, AAC, FLAC, OGG, OPUS — any format works</p>
      {/* No handler of its own: the click bubbles to the zone, which opens the picker. */}
      <button style={{ background: C.primary, border: "none", color: "#fff", borderRadius: 10, padding: "11px 24px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Browse files</button>
      <input ref={inputRef} type="file" accept={AUDIO_ACCEPT} style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </div>
  );
}
