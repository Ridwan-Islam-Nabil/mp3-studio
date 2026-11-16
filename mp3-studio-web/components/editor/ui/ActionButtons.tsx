/** Buttons at the end of the playback bar: Mark to Cut, Preview, Export (with progress fill). */

import { C, ghostBtn, keepText, primaryBtn } from "../theme";
import type { RegionMode } from "../types";

export function MarkToCutButton({ onClick, disabled, mode = "cut" }: { onClick: () => void; disabled: boolean; mode?: RegionMode }) {
  if (mode === "keep") {
    return (
      <button onClick={onClick} disabled={disabled} title="Drop a 10 s keep region centered on the playhead (N)"
        style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.45)", color: keepText, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
        ✓ Mark to Keep
      </button>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} title="Drop a 10 s cut centered on the playhead (N)"
      style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)", color: C.cutText, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
      ✂ Mark to Cut
    </button>
  );
}

/** Progress fill behind a button label. */
function ProgressFill({ pct, color }: { pct: number; color: string }) {
  return <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: color, transition: "width .2s" }} />;
}

interface PreviewProps { onClick: () => void; disabled: boolean; running: boolean; progress: number }

export function PreviewButton({ onClick, disabled, running, progress }: PreviewProps) {
  return (
    <button onClick={onClick} disabled={disabled} title="Preview the result (P)"
      style={ghostBtn({ minWidth: 110, justifyContent: "center", position: "relative", overflow: "hidden" })}>
      {running && <ProgressFill pct={progress} color="rgba(124,58,237,0.2)" />}
      <span style={{ position: "relative" }}>{running ? `Building… ${progress}%` : "▶ Preview"}</span>
    </button>
  );
}

interface ExportProps extends PreviewProps {
  done: boolean;
  /** Extension of the output, shown in the label ("mp3" → "⬇ Export MP3"). */
  extension?: string;
}

export function ExportButton({ onClick, disabled, running, progress, done, extension = "mp3" }: ExportProps) {
  return (
    <button onClick={onClick} disabled={disabled} style={primaryBtn({ minWidth: 140 })}>
      {running && <ProgressFill pct={progress} color="rgba(255,255,255,0.15)" />}
      <span style={{ position: "relative" }}>
        {running ? `Exporting… ${progress}%` : done ? "✓ Exported!" : `⬇ Export ${extension.toUpperCase()}`}
      </span>
    </button>
  );
}
