/**
 * List of regions (cuts, or keep regions in keep mode). Each row: ▶ play the region once ·
 * ⟲ loop it · start → end (click a time to type a new one) · length · [⬇ export this section,
 * keep mode] · × remove. Rows are focusable; Delete/Backspace on a focused row removes it
 * (focus moves to the next row).
 *
 * In cut mode with cuts, a "Kept parts" list below the rows shows what remains between the
 * cuts, each with "⬇ Export" (one file at a time — there is deliberately no "export all").
 * `highlightSplit` (from `?tool=split`) rings those export buttons and shows a hint.
 *
 * `compact` is the smaller panel shown inside the fullscreen waveform card; the default is
 * the full card below the playback bar.
 */

import { useEffect, useRef, useState } from "react";
import type { TimeRange } from "@/lib/ffmpeg";
import { fmt, fmtPrecise, parseTime, resolveTimeEdit } from "../editorUtils";
import type { ActiveRegion } from "../hooks/useRegionPlayback";
import { C, card, highlightRing, keepText, sectionLabel } from "../theme";
import type { RegionData, RegionMode } from "../types";

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
  mode?: RegionMode;
  /** Cut mode: what remains between the cuts (shown as "Kept parts" when there are cuts). */
  keptParts?: TimeRange[];
  /** Export one section as its own file. `key` identifies the button that shows progress. */
  onExportSection?: (section: TimeRange, index: number, count: number, key: string) => void;
  /** Key of the section being exported, or null. */
  exportingKey?: string | null;
  exportProgress?: number;
  /** Another FFmpeg job is running (export buttons disabled). */
  busy?: boolean;
  /** `?tool=split`: ring the export buttons and show a hint. */
  highlightSplit?: boolean;
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
  mode = "cut", keptParts = [], onExportSection, exportingKey = null, exportProgress = 0, busy = false,
  highlightSplit = false,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const focusIndexRef = useRef<number | null>(null);
  const keep = mode === "keep";
  const noun = keep ? "keep region" : "cut";
  // Keep mode: sections are numbered by position in the file, not by creation order.
  const order = keep ? [...regions].sort((a, b) => a.start - b.start).map((r) => r.id) : [];

  // After a keyboard removal, focus the row that took its place (or the new last row).
  useEffect(() => {
    const i = focusIndexRef.current;
    if (i === null) return;
    focusIndexRef.current = null;
    const rows = listRef.current?.querySelectorAll<HTMLElement>("[data-region-row]");
    if (rows && rows.length > 0) rows[Math.min(i, rows.length - 1)].focus();
  }, [regions]);

  const exportBtn = (section: TimeRange, index: number, count: number, key: string, label: string, wide: boolean) => {
    const running = exportingKey === key;
    return (
      <button type="button" disabled={busy}
        onClick={() => onExportSection?.(section, index, count, key)}
        aria-label={`Export this section ${label}`}
        title={running ? `Exporting… ${exportProgress}%` : "Export just this section as its own file"}
        style={{
          ...rowBtn(running), width: wide || running ? "auto" : 26, padding: wide || running ? "0 8px" : 0,
          fontSize: wide ? 11.5 : 12, fontWeight: 700, whiteSpace: "nowrap",
          opacity: busy && !running ? 0.45 : 1, cursor: busy ? "not-allowed" : "pointer",
          ...highlightRing(highlightSplit && !running),
        }}>
        {running ? `${exportProgress}%` : wide ? "⬇ Export" : "⬇"}
      </button>
    );
  };

  const count = <span style={{ color: C.faint, fontWeight: 400 }}>({regions.length})</span>;
  const cutPill = <span style={pill("rgba(239,68,68,0.12)", "rgba(239,68,68,0.3)", C.cutText, compact)}>✂ CUT</span>;
  const keepPill = <span style={pill("rgba(16,185,129,0.12)", "rgba(16,185,129,0.3)", keepText, compact)}>✓ KEEP MODE</span>;

  const header = keep ? (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 10 : 14, marginBottom: compact ? 8 : 14, flexWrap: "wrap" }}>
      {compact
        ? <span style={sectionLabel()}>Keep Regions {count}</span>
        : <h3 style={sectionLabel({ margin: 0, fontSize: 13 })}>Keep Regions {count}</h3>}
      {keepPill}
      <span style={{ fontSize: 11, color: C.dim }}>
        Only the <strong style={{ color: keepText }}>green</strong> regions are saved. Everything outside them is removed.
      </span>
    </div>
  ) : compact ? (
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
      <span style={pill("rgba(16,185,129,0.12)", "rgba(16,185,129,0.3)", keepText, false)}>✓ KEPT</span>
      <span style={{ fontSize: 11, color: C.dim }}>Everything <strong>outside</strong> the regions is saved.</span>
    </div>
  );

  const empty = keep ? (
    <p style={{ color: C.faint, fontSize: 13, textAlign: "center", padding: compact ? "10px 0" : "16px 0", margin: 0 }}>
      No keep regions yet. Drag on the waveform or click <strong style={{ color: keepText }}>✓ Mark to Keep</strong> to select the parts you want to save.
    </p>
  ) : compact ? (
    <p style={{ color: C.faint, fontSize: 13, textAlign: "center", padding: "10px 0", margin: 0 }}>
      No cuts yet — drag on the waveform to mark sections to remove.
    </p>
  ) : (
    <p style={{ color: C.faint, fontSize: 13, textAlign: "center", padding: "16px 0", margin: 0 }}>
      No cuts yet. Drag on the waveform or click <strong style={{ color: C.cutText }}>✂ Mark to Cut</strong> to select parts you want to remove.
    </p>
  );

  const splitHint = highlightSplit && !compact && (
    <p data-testid="split-hint" style={{ margin: "0 0 12px", fontSize: 12, color: C.text, background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.4)", borderRadius: 8, padding: "8px 12px", lineHeight: 1.5 }}>
      ✂ <strong>Split:</strong>{" "}
      {keep
        ? "mark each part you want to keep — every green region has its own ⬇ button that saves just that part."
        : "mark cuts between the parts — every part left over is listed under “Kept parts” with its own ⬇ Export button."}
      {" "}One file at a time.
    </p>
  );

  const keptList = !keep && !compact && regions.length > 0 && keptParts.length > 0 && onExportSection && (
    <div data-testid="kept-parts" style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={sectionLabel({ color: keepText })}>Kept parts · {keptParts.length}</span>
        <span style={{ fontSize: 11, color: C.dim }}>What remains between the cuts. Export any one on its own.</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {keptParts.map((p, i) => {
          const label = `${fmt(p.start)} to ${fmt(p.end)}`;
          return (
            <div key={`${p.start}-${p.end}`} data-kept-part style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 14px", background: C.surface, borderRadius: 8, border: `1px solid ${C.border}` }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.success, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>Part {i + 1}</span>
              <span style={{ fontFamily: "monospace", fontSize: 13, flex: 1, minWidth: 0 }}>{fmt(p.start)} – {fmt(p.end)}</span>
              <span style={{ fontSize: 12, color: C.dim }}>{(p.end - p.start).toFixed(1)}s</span>
              {exportBtn(p, i, keptParts.length, `part-${i}-${p.start}`, label, true)}
            </div>
          );
        })}
      </div>
    </div>
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
            aria-label={`${keep ? "Keep region" : "Cut"} ${label}`}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget || (e.key !== "Delete" && e.key !== "Backspace")) return;
              e.preventDefault();
              focusIndexRef.current = index;
              onRemove(r.id);
            }}
            style={{ display: "flex", alignItems: "center", gap: compact ? 8 : 10, padding: compact ? "6px 12px" : "8px 14px", background: C.surface, borderRadius: compact ? 7 : 8, border: `1px solid ${playing ? "rgba(6,182,212,0.45)" : C.border}`, outlineColor: C.primary }}
          >
            <span style={{ width: compact ? 7 : 8, height: compact ? 7 : 8, borderRadius: "50%", background: keep ? C.success : C.error, flexShrink: 0 }} />
            <button onClick={() => onPlay(r.id)} style={rowBtn(playing && !looping)}
              aria-label={playing && !looping ? `Stop ${noun} ${label}` : `Play ${noun} ${label}`}
              title={playing && !looping ? "Stop" : `Play just this ${noun}`}>
              {playing && !looping ? "■" : "▶"}
            </button>
            <button onClick={() => onLoop(r.id)} style={rowBtn(looping)}
              aria-label={`Loop ${noun} ${label}`} aria-pressed={looping}
              title={looping ? "Stop looping (L)" : `Loop this ${noun}`}>
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
            {keep && onExportSection && exportBtn(r, order.indexOf(r.id), regions.length, r.id, label, false)}
            <button onClick={() => onRemove(r.id)} aria-label={`Remove ${noun} ${fmt(r.start)} to ${fmt(r.end)}`}
              style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 18, padding: "0 2px", lineHeight: 1 }}>×</button>
          </div>
        );
      })}
    </div>
  );

  const body = <>{header}{splitHint}{regions.length === 0 ? empty : rows}{keptList}</>;

  return compact ? (
    <div data-testid="region-list-compact" style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 12, overflowY: "auto", maxHeight: 200 }}>
      {body}
    </div>
  ) : (
    <div data-testid="region-list" data-mode={mode} style={card({ padding: 20 })}>{body}</div>
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
