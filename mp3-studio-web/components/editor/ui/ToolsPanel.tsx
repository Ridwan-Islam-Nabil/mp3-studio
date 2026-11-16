/**
 * "Tools" card (below the playback bar): Mode (cut / keep), Remove silence, Normalize,
 * Format, Fades, Ringtone. A responsive grid of small tiles — one column on phones.
 *
 * Purely presentational: settings come from useToolSettings (via EditorSession), mode switches
 * go through EditorSession (which asks before converting existing regions), Detect silence
 * runs in useFFmpegJob. The tile a `?tool=` link points at gets a cyan ring (`highlight`).
 * Each tile carries `data-tool="<tool id>"` for tests and the SEO pages' screenshots.
 */

import type { CSSProperties, ReactNode } from "react";
import { IPHONE_RINGTONE_MAX_SEC, LOUDNORM_TARGET } from "@/lib/ffmpeg";
import { fmt } from "../editorUtils";
import type { SilenceSettings } from "../hooks/useToolSettings";
import type { ToolId } from "../toolParams";
import { FADE_CHOICES, RINGTONE_FADE, outputFormat, ringtoneTooLong, type ToolSettings } from "../toolSettings";
import { C, card, highlightRing, keepText, sectionLabel, sliderBg } from "../theme";
import type { RegionMode } from "../types";

interface Props {
  settings: ToolSettings;
  onChange: (patch: Partial<ToolSettings>) => void;
  silence: SilenceSettings;
  onSilenceChange: (s: SilenceSettings) => void;
  mode: RegionMode;
  onModeChange: (to: RegionMode) => void;
  /** Tool a `?tool=` link points at. */
  highlight: ToolId | null;
  /** Length of the output with the current regions (seconds). */
  keptSec: number;
  /** False until the audio has decoded. */
  ready: boolean;
  /** Another FFmpeg job is running. */
  busy: boolean;
  detecting: boolean;
  detectProgress: number;
  onDetectSilence: () => void;
}

const tileStyle = (on: boolean): CSSProperties => ({
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px",
  display: "flex", flexDirection: "column", gap: 8, minWidth: 0, transition: "box-shadow .2s, border-color .2s",
  ...highlightRing(on),
});

const hint: CSSProperties = { fontSize: 11.5, color: C.muted, margin: 0, lineHeight: 1.5 };
const checkRow: CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text, cursor: "pointer" };
const checkbox: CSSProperties = { width: 16, height: 16, accentColor: C.primary, cursor: "pointer", margin: 0 };
const smallSelect: CSSProperties = {
  background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 6px", fontSize: 12,
};

function Tile({ tool, title, icon, on, children }: { tool: string; title: string; icon: string; on: boolean; children: ReactNode }) {
  return (
    <section data-tool={tool} data-highlighted={on || undefined} aria-label={title} style={tileStyle(on)}>
      <h4 style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
        <span aria-hidden>{icon}</span>{title}
      </h4>
      {children}
    </section>
  );
}

interface SegOption<T extends string> { value: T; label: string; color?: string }

/** Segmented control: a group of toggle buttons (aria-pressed), one selected. */
function Seg<T extends string>({ label, options, value, onChange, disabled }: {
  label: string; options: SegOption<T>[]; value: T; onChange: (v: T) => void; disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} style={{ display: "flex", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 2, gap: 2, opacity: disabled ? 0.45 : 1 }}>
      {options.map((o) => {
        const active = o.value === value;
        const color = o.color ?? C.primary;
        return (
          <button key={o.value} type="button" aria-pressed={active} disabled={disabled}
            onClick={() => onChange(o.value)}
            style={{
              flex: 1, minWidth: 0, border: "none", borderRadius: 6, padding: "5px 8px", fontSize: 12, fontWeight: 700,
              cursor: disabled ? "not-allowed" : "pointer", whiteSpace: "nowrap", transition: "all .15s",
              background: active ? color : "transparent", color: active ? "#fff" : C.muted,
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function FadeRow({ label, on, sec, onToggle, onSec }: {
  label: string; on: boolean; sec: number; onToggle: (v: boolean) => void; onSec: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
      <label style={checkRow}>
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} style={checkbox} />
        {label}
      </label>
      <select aria-label={`${label} length`} value={sec} onChange={(e) => onSec(Number(e.target.value))} style={smallSelect}>
        {FADE_CHOICES.map((s) => <option key={s} value={s}>{s} s</option>)}
      </select>
    </div>
  );
}

export function ToolsPanel({
  settings, onChange, silence, onSilenceChange, mode, onModeChange, highlight, keptSec,
  ready, busy, detecting, detectProgress, onDetectSilence,
}: Props) {
  const fmtNow = outputFormat(settings);
  const tooLong = ringtoneTooLong(settings, keptSec);

  return (
    <div data-testid="tools-panel" style={card({ padding: 16 })}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <h3 style={sectionLabel({ margin: 0, fontSize: 13 })}>🛠 Tools</h3>
        <span style={{ fontSize: 11, color: C.dim }}>Free · runs in your browser · applied on Preview and Export</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))", gap: 10 }}>
        {/* Mode */}
        <Tile tool="keep" title="Mode" icon={mode === "keep" ? "✓" : "✂"} on={highlight === "keep"}>
          <Seg<RegionMode> label="Region mode" value={mode} onChange={onModeChange} options={[
            { value: "cut", label: "✂ Cut parts", color: "rgba(239,68,68,0.85)" },
            { value: "keep", label: "✓ Keep parts", color: "rgba(16,185,129,0.85)" },
          ]} />
          <p style={hint}>
            {mode === "keep"
              ? <>Only the <span style={{ color: keepText, fontWeight: 700 }}>green</span> regions are saved. Everything else is removed.</>
              : <>The <span style={{ color: C.cutText, fontWeight: 700 }}>red</span> regions are removed. Everything else is saved.</>}
          </p>
        </Tile>

        {/* Remove silence */}
        <Tile tool="remove-silence" title="Remove silence" icon="🔇" on={highlight === "remove-silence"}>
          <button type="button" onClick={onDetectSilence} disabled={!ready || busy}
            style={{
              background: "rgba(124,58,237,0.15)", border: `1px solid ${C.primary}`, color: C.text, borderRadius: 8,
              padding: "7px 12px", fontSize: 12.5, fontWeight: 700, cursor: !ready || busy ? "not-allowed" : "pointer",
              opacity: !ready || (busy && !detecting) ? 0.5 : 1, position: "relative", overflow: "hidden",
            }}>
            {detecting && <span style={{ position: "absolute", inset: 0, width: `${detectProgress}%`, background: "rgba(124,58,237,0.3)", transition: "width .2s" }} />}
            <span style={{ position: "relative" }}>{detecting ? `Detecting… ${detectProgress}%` : "Detect silence"}</span>
          </button>
          <p style={hint}>
            {mode === "keep"
              ? "Finds quiet parts and removes them from what you keep. Undo with Ctrl+Z."
              : "Finds quiet parts and marks them as cuts you can review. Undo with Ctrl+Z."}
          </p>
          <details>
            <summary style={{ fontSize: 11.5, color: C.muted, cursor: "pointer" }}>Advanced</summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              <label style={{ fontSize: 11.5, color: C.muted, display: "flex", flexDirection: "column", gap: 4 }}>
                <span>Quieter than <strong style={{ color: C.text }}>{silence.thresholdDb} dB</strong> counts as silence</span>
                <input type="range" min={-70} max={-20} step={1} value={silence.thresholdDb} aria-label="Silence threshold (dB)"
                  onChange={(e) => onSilenceChange({ ...silence, thresholdDb: Number(e.target.value) })}
                  style={{ background: sliderBg(silence.thresholdDb, -70, -20, "#7c3aed", "#06b6d4") }} />
              </label>
              <label style={{ fontSize: 11.5, color: C.muted, display: "flex", flexDirection: "column", gap: 4 }}>
                <span>Only silences of <strong style={{ color: C.text }}>{silence.minSilenceSec.toFixed(1)} s</strong> or longer</span>
                <input type="range" min={0.2} max={5} step={0.1} value={silence.minSilenceSec} aria-label="Minimum silence length (seconds)"
                  onChange={(e) => onSilenceChange({ ...silence, minSilenceSec: Number(e.target.value) })}
                  style={{ background: sliderBg(silence.minSilenceSec, 0.2, 5, "#7c3aed", "#06b6d4") }} />
              </label>
            </div>
          </details>
        </Tile>

        {/* Normalize */}
        <Tile tool="normalize" title="Normalize loudness" icon="📶" on={highlight === "normalize"}>
          <label style={checkRow}>
            <input type="checkbox" checked={settings.normalize} onChange={(e) => onChange({ normalize: e.target.checked })} style={checkbox} />
            Normalize loudness
          </label>
          <p style={hint}>
            Evens out the volume to {LOUDNORM_TARGET.integratedLufs} LUFS, a common streaming level. Adds about a second to each export.
          </p>
        </Tile>

        {/* Format */}
        <Tile tool="convert" title="Output format" icon="🎚" on={highlight === "convert"}>
          <Seg label="Output format" value={settings.format} disabled={settings.ringtone !== null}
            onChange={(format) => onChange({ format })}
            options={[{ value: "mp3", label: "MP3" }, { value: "wav", label: "WAV" }, { value: "m4a", label: "M4A" }]} />
          {settings.ringtone !== null ? (
            <p style={hint}>Set by ringtone mode: <strong style={{ color: C.text }}>{fmtNow.toUpperCase()}</strong>.</p>
          ) : settings.format === "wav" ? (
            <p style={hint}>Lossless WAV — best quality, much larger files.</p>
          ) : (
            <Seg label="Quality" value={settings.quality} onChange={(quality) => onChange({ quality })}
              options={[{ value: "standard", label: "Standard" }, { value: "high", label: "High" }]} />
          )}
        </Tile>

        {/* Fades */}
        <Tile tool="fade" title="Fade in / out" icon="◢" on={false}>
          <FadeRow label="Fade in" on={settings.fadeIn} sec={settings.fadeInSec}
            onToggle={(fadeIn) => onChange({ fadeIn })} onSec={(fadeInSec) => onChange({ fadeInSec, fadeIn: true })} />
          <FadeRow label="Fade out" on={settings.fadeOut} sec={settings.fadeOutSec}
            onToggle={(fadeOut) => onChange({ fadeOut })} onSec={(fadeOutSec) => onChange({ fadeOutSec, fadeOut: true })} />
          <p style={hint}>At the very start / end of the exported file.</p>
        </Tile>

        {/* Ringtone */}
        <Tile tool="ringtone" title="Ringtone" icon="🔔" on={highlight === "ringtone"}>
          <label style={checkRow}>
            <input type="checkbox" checked={settings.ringtone !== null}
              onChange={(e) => onChange({ ringtone: e.target.checked ? "iphone" : null })} style={checkbox} />
            Ringtone mode
          </label>
          {settings.ringtone !== null && (
            <Seg label="Ringtone device" value={settings.ringtone} onChange={(ringtone) => onChange({ ringtone })}
              options={[{ value: "iphone", label: "iPhone (M4R)" }, { value: "android", label: "Android (MP3)" }]} />
          )}
          {settings.ringtone === null ? (
            <p style={hint}>Exports a ringtone file with a short fade in and out.</p>
          ) : (
            <p style={hint}>
              Adds a {RINGTONE_FADE.inSec} s fade in and {RINGTONE_FADE.outSec} s fade out. Length: {" "}
              <strong data-testid="ringtone-length" style={{ color: tooLong ? C.error : C.text }}>{fmt(keptSec)}</strong>
              {settings.ringtone === "iphone" && !tooLong && ` (iPhone limit ${IPHONE_RINGTONE_MAX_SEC} s)`}
            </p>
          )}
          {tooLong && (
            <p role="status" data-testid="ringtone-warning"
              style={{ ...hint, color: "#fecaca", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 7, padding: "6px 8px" }}>
              ⚠ Too long for iPhone: ringtones must be {IPHONE_RINGTONE_MAX_SEC} seconds or shorter, or iOS won&apos;t list them.
              {mode === "keep" ? " Make the green region shorter." : " Mark more to cut, or switch to Keep mode and select up to 40 s."}
            </p>
          )}
        </Tile>
      </div>
    </div>
  );
}
