/**
 * Preview modal: plays the merged result in a plain HTML5 <audio> (not a second WaveSurfer),
 * lets the user edit the output name, and downloads the already-rendered preview.
 *
 * Rendered into document.body (portal) so it sits above the editor content's stacking
 * context — and above the feedback button — like it did before the editor was split up.
 */

import { useRef } from "react";
import { createPortal } from "react-dom";
import { C, ghostBtn, primaryBtn, textInput } from "../theme";

interface Props {
  url: string;
  cutCount: number;
  outputName: string;
  onOutputNameChange: (name: string) => void;
  onClose: () => void;
  onDownload: () => void;
}

export function PreviewModal({ url, cutCount, outputName, onOutputNameChange, onClose, onDownload }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };
  const close    = () => { stopAudio(); onClose(); };
  const download = () => { stopAudio(); onDownload(); };

  return createPortal(
    <div onClick={close} data-testid="preview-modal" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="preview-title" onClick={(e) => e.stopPropagation()}
        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, width: "min(90vw,540px)", padding: 32, boxShadow: C.shadow, color: C.text }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 id="preview-title" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Preview</h2>
          <button onClick={close} aria-label="Close preview" style={{ background: "none", border: "none", color: C.muted, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
          <label style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>Save as:</label>
          <input value={outputName} onChange={(e) => onOutputNameChange(e.target.value)} style={textInput()} />
          <span style={{ fontSize: 12, color: C.dim }}>.mp3</span>
        </div>
        <audio ref={audioRef} src={url} controls autoPlay style={{ width: "100%", marginBottom: 14, borderRadius: 8 }} />
        <p style={{ fontSize: 12, color: C.dim, marginBottom: 20, lineHeight: 1.6 }}>
          {cutCount === 0 ? "No cuts — full audio." : `${cutCount} cut${cutCount > 1 ? "s" : ""} removed.`} Listen, then download.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={close} style={ghostBtn()}>Continue Editing</button>
          <button onClick={download} style={{ ...primaryBtn(), padding: "9px 20px" }}>⬇ Download MP3</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
