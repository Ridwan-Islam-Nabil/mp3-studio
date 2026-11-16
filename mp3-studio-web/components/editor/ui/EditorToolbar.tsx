/** Row above the waveform: file name, output name, undo/redo/reset, change file. */

import { useRef } from "react";
import { AUDIO_ACCEPT } from "../editorUtils";
import { C, ghostBtn, textInput } from "../theme";

interface Props {
  fileName: string;
  outputName: string;
  onOutputNameChange: (name: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onReplaceFile: (f: File) => void;
  /** Extension of the output format, shown after the name ("mp3", "wav", …). */
  extension?: string;
}

export function EditorToolbar({
  fileName, outputName, onOutputNameChange, canUndo, canRedo, onUndo, onRedo, onReset, onReplaceFile,
  extension = "mp3",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const disabledStyle = (enabled: boolean) =>
    ghostBtn({ opacity: enabled ? 1 : 0.35, cursor: enabled ? "pointer" : "not-allowed" });

  return (
    <div data-testid="editor-toolbar" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ color: C.dim, fontSize: 13, flex: "1 1 160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📄 {fileName}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 220px" }}>
        <label style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>Save as:</label>
        <input value={outputName} onChange={(e) => onOutputNameChange(e.target.value)}
          style={textInput({ minWidth: 0 })} />
        <span data-testid="output-extension" style={{ fontSize: 12, color: C.dim }}>.{extension}</span>
      </div>

      <button onClick={onUndo} disabled={!canUndo} title="Undo" style={disabledStyle(canUndo)}>↩ Undo</button>
      <button onClick={onRedo} disabled={!canRedo} title="Redo" style={disabledStyle(canRedo)}>↪ Redo</button>
      <button onClick={onReset} title="Clear all cuts"
        style={ghostBtn({ color: C.cutText, borderColor: "rgba(239,68,68,0.4)" })}>↺ Reset</button>

      <button onClick={() => inputRef.current?.click()} style={ghostBtn()}>Change file</button>
      <input ref={inputRef} type="file" accept={AUDIO_ACCEPT} style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onReplaceFile(f); }} />
    </div>
  );
}
