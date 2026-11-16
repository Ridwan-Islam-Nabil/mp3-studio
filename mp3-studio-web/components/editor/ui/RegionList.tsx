/**
 * List of cut regions. Each row: ▶ play the cut once · ⟲ loop it · start → end (click a time
 * to type a new one) · length · × remove. Rows are focusable; Delete/Backspace on a focused
 * row removes it (focus moves to the next row).
 *
 * `compact` is the smaller panel shown inside the fullscreen waveform card; the default is
 * the full card below the playback bar.
 */

import { useEffect, useRef, useState } from "react";
import { fmt, fmtPrecise, parseTime, resolveTimeEdit } from "../editorUtils";
import type { ActiveRegion } from "../hooks/useRegionPlayback";
import { C, card, sectionLabel } from "../theme";
import type { RegionData } from "../types";

interface Props {
  regions: RegionData[];
  duration: number;
  onRemove: (id: string) => void;
  onChangeTimes: (id: string, start: number, end: number) => void;
  /** The region currently playing/looping, if any. */
  activeRegion: ActiveRegion | null;
  onPlay: (id: string) => void;
  onLoop: (id: string) => void;
  compact?: boolean;
}

const pill = (bg: string, border: string, color: string, compact: boolean): React.CSSProperties => ({
  background: bg, border: `1px solid ${border}`, color, borderRadius: 5,
  padding: compact ? "1px 7px" : "2px 8px", fontSize: compact ? 10 : 11, fontWeight: 700,
});

const rowBtn = (active: boolean): React.CSSProperties => ({
  background: active ? "rgba(6,182,212,0.12)" : "transparent",
  border: `1px solid ${active ? C.accent : C.border}`,
  color: active ? C.accent : C.muted,
  borderRadius: 6, width: 26, height: 26, padding: 0, flexShrink: 0,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  fontSize: 12, lineHeight: 1, cursor: "pointer", transition: "all .15s",
});

export function RegionList({
  regions, duration, onRemove, onChangeTimes, activeRegion, onPlay, onLoop, compact = false,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const focusIndexRef = useRef<number | null>(null);

  // After a keyboard removal, focus the row that took its place (or the new last row).
  useEffect(() => {
    const i = focusIndexRef.current;
    if (i === null) return;
    focusIndexRef.current = null;
    const rows = listRef.current?.querySelectorAll<HTMLElement>("[data-region-row]");
    if (rows && rows.length > 0) rows[Math.min(i, rows.length - 1)].focus();
  }, [regions]);

  const count = <span style={{ color: C.faint, fontWeight: 400 }}>({regions.length})</span>;
  const cutPill = <span style={pill("rgba(239,68,68,0.12)", "rgba(239,68,68,0.3)", C.cutText, compact)}>✂ CUT</span>;

  const header = compact ? (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
      <span style={sectionLabel()}>Cut Regions {count}</span>
      {cutPill}
      <span style={{ fontSize: 11, color: C.dim }}>Parts outside regions are kept.</span>
    </div>
  ) : (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
      <h3 style={sectionLabel({ margin: 0, fontSize: 13 })}>Cut Regions {count}</h3>
      {cutPill}
      <span style={{ fontSize: 11, color: C.dim }}>Highlighted regions = parts that will be deleted.</span>
      <span style={pill("rgba(16,185,129,0.12)", "rgba(16,185,129,0.3)", "#6ee7b7", false)}>✓ KEPT</span>
      <span style={{ fontSize: 11, color: C.dim }}>Everything <strong>outside</strong> the regions is saved.</span>
    </div>
  );

  const empty = compact ? (
    <p style={{ color: C.faint, fontSize: 13, textAlign: "center", padding: "10px 0", margin: 0 }}>
      No cuts yet — drag on the waveform to mark sections to remove.
    </p>
  ) : (
    <p style={{ color: C.faint, fontSize: 13, textAlign: "center", padding: "16px 0", margin: 0 }}>
      No cuts yet. Drag on the waveform or click <strong style={{ color: C.cutText }}>✂ Mark to Cut</strong> to select parts you want to remove.
    </p>
  );

  const rows = (
    <div ref={listRef} style={{ display: "flex", flexDirection: "column", gap: compact ? 5 : 7 }}>
      {regions.map((r, index) => {
        const label = `${fmt(r.start)} to ${fmt(r.end)}`;
        const playing = activeRegion?.id === r.id;
        const looping = playing && activeRegion.loop;
        return (
          <div
            key={r.id}
            data-region-row
            tabIndex={0}
            aria-label={`Cut ${label}`}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget || (e.key !== "Delete" && e.key !== "Backspace")) return;
              e.preventDefault();
              focusIndexRef.current = index;
              onRemove(r.id);
            }}
            style={{ display: "flex", alignItems: "center", gap: compact ? 8 : 10, padding: compact ? "6px 12px" : "8px 14px", background: C.surface, borderRadius: compact ? 7 : 8, border: `1px solid ${playing ? "rgba(6,182,212,0.45)" : C.border}`, outlineColor: C.primary }}
          >
            <span style={{ width: compact ? 7 : 8, height: compact ? 7 : 8, borderRadius: "50%", background: C.error, flexShrink: 0 }} />
            <button onClick={() => onPlay(r.id)} style={rowBtn(playing && !looping)}
              aria-label={playing && !looping ? `Stop cut ${label}` : `Play cut ${label}`}
              title={playing && !looping ? "Stop" : "Play just this cut"}>
              {playing && !looping ? "■" : "▶"}
            </button>
            <button onClick={() => onLoop(r.id)} style={rowBtn(looping)}
              aria-label={`Loop cut ${label}`} aria-pressed={looping}
              title={looping ? "Stop looping (L)" : "Loop this cut"}>
              ⟲
            </button>
            <span style={{ fontFamily: "monospace", fontSize: 13, flex: 1, minWidth: 0 }}>
              <TimeField value={r.start} which="start"
                onCommit={(v) => commitTime(r, "start", v, duration, onChangeTimes)} />
              {" → "}
              <TimeField value={r.end} which="end"
                onCommit={(v) => commitTime(r, "end", v, duration, onChangeTimes)} />
            </span>
            <span style={{ fontSize: 12, color: C.dim }}>{(r.end - r.start).toFixed(1)}s</span>
            <button onClick={() => onRemove(r.id)} aria-label={`Remove cut ${fmt(r.start)} to ${fmt(r.end)}`}
              style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 18, padding: "0 2px", lineHeight: 1 }}>×</button>
          </div>
        );
      })}
    </div>
  );

  const body = <>{header}{regions.length === 0 ? empty : rows}</>;

  return compact ? (
    <div data-testid="region-list-compact" style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 12, overflowY: "auto", maxHeight: 200 }}>
      {body}
    </div>
  ) : (
    <div data-testid="region-list" style={card({ padding: 20 })}>{body}</div>
  );
}

/** Validates a typed time; applies it and returns null, or returns the error message. */
function commitTime(
  r: RegionData, which: "start" | "end", text: string, duration: number,
  onChangeTimes: Props["onChangeTimes"],
): string | null {
  const value = parseTime(text);
  if (value === null) return "Use M:SS.mmm, SS.mmm or H:MM:SS.mmm";
  const res = resolveTimeEdit(r, which, value, duration);
  if ("error" in res) return res.error;
  onChangeTimes(r.id, res.start, res.end);
  return null;
}

interface TimeFieldProps {
  value: number;
  which: "start" | "end";
  /** Returns an error message to keep the field open, or null when applied. */
  onCommit: (text: string) => string | null;
}

/** A time that turns into a text input when clicked. Enter/blur commits, Esc cancels. */
function TimeField({ value, which, onCommit }: TimeFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set once Enter applied or Esc cancelled: removing the focused input fires blur, which
  // must not commit (again).
  const doneRef = useRef(false);

  if (draft === null) {
    return (
      <button
        onClick={() => { doneRef.current = false; setDraft(fmtPrecise(value)); setError(null); }}
        title={`Click to type a new ${which} time`}
        aria-label={`Edit ${which} time ${fmt(value)}`}
        style={{ background: "none", border: "none", borderBottom: `1px dashed ${C.faint}`, color: "inherit", font: "inherit", padding: 0, cursor: "text" }}
      >{fmt(value)}</button>
    );
  }

  const close = () => { doneRef.current = true; setDraft(null); setError(null); };
  return (
    <input
      autoFocus
      value={draft}
      aria-label={`${which === "start" ? "Start" : "End"} time`}
      aria-invalid={error !== null}
      title={error ?? "M:SS.mmm · Enter to apply · Esc to cancel"}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => { setDraft(e.target.value); setError(null); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const err = onCommit(draft);
          if (err) setError(err); else close();
        } else if (e.key === "Escape") {
          e.preventDefault(); // keep Esc from also closing fullscreen
          e.stopPropagation();
          close();
        }
      }}
      onBlur={() => {
        if (doneRef.current) return;
        onCommit(draft); // an invalid time on blur just reverts
        close();
      }}
      style={{
        width: "11ch", background: C.bg, color: C.text, font: "inherit",
        border: `1px solid ${error ? C.error : C.primary}`, borderRadius: 5, padding: "1px 5px", outline: "none",
      }}
    />
  );
}
