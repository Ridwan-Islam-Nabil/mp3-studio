/**
 * List of cut regions with a remove button per row.
 * `compact` is the smaller panel shown inside the fullscreen waveform card; the default is
 * the full card below the playback bar.
 */

import { fmt } from "../editorUtils";
import { C, card, sectionLabel } from "../theme";
import type { RegionData } from "../types";

interface Props {
  regions: RegionData[];
  onRemove: (id: string) => void;
  compact?: boolean;
}

const pill = (bg: string, border: string, color: string, compact: boolean): React.CSSProperties => ({
  background: bg, border: `1px solid ${border}`, color, borderRadius: 5,
  padding: compact ? "1px 7px" : "2px 8px", fontSize: compact ? 10 : 11, fontWeight: 700,
});

export function RegionList({ regions, onRemove, compact = false }: Props) {
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
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 5 : 7 }}>
      {regions.map((r) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: compact ? "7px 12px" : "9px 14px", background: C.surface, borderRadius: compact ? 7 : 8, border: `1px solid ${C.border}` }}>
          <span style={{ width: compact ? 7 : 8, height: compact ? 7 : 8, borderRadius: "50%", background: C.error, flexShrink: 0 }} />
          <span style={{ fontFamily: "monospace", fontSize: 13, flex: 1 }}>{fmt(r.start)} → {fmt(r.end)}</span>
          <span style={{ fontSize: 12, color: C.dim }}>{(r.end - r.start).toFixed(1)}s</span>
          <button onClick={() => onRemove(r.id)} aria-label={`Remove cut ${fmt(r.start)} to ${fmt(r.end)}`}
            style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 18, padding: "0 2px", lineHeight: 1 }}>×</button>
        </div>
      ))}
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
