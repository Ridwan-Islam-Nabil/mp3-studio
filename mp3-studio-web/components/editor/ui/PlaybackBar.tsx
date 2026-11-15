/**
 * Transport bar: skip/play/skip, seek, volume + mute, speed. `children` are appended at the
 * end of the bar (Mark to Cut, Preview, Export — see ActionButtons.tsx).
 */

import type { ReactNode } from "react";
import { fmt } from "../editorUtils";
import { SKIP_SECONDS, type Playback } from "../hooks/usePlayback";
import { C, badge, card, iconBtn, sliderBg } from "../theme";

interface Props {
  playback: Playback;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  children?: ReactNode;
}

export function PlaybackBar({ playback, isPlaying, currentTime, duration, children }: Props) {
  const { speed, setSpeed, volume, changeVolume, muted, toggleMute, togglePlay, skip, seekTo } = playback;
  const seekPct = duration > 0 ? (currentTime / duration) * 1000 : 0;

  return (
    <div data-testid="playback-bar" style={card({ padding: "12px 20px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" })}>
      {/* Transport */}
      <button onClick={() => skip(-SKIP_SECONDS)} style={iconBtn()} title="Skip back 5s">⏪</button>
      <button onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}
        style={{ background: C.primary, border: "none", color: "#fff", borderRadius: "50%", width: 42, height: 42, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {isPlaying ? "⏸" : "▶"}
      </button>
      <button onClick={() => skip(SKIP_SECONDS)} style={iconBtn()} title="Skip forward 5s">⏩</button>

      {/* Seek */}
      <span style={{ fontFamily: "monospace", fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{fmt(currentTime)}</span>
      <input type="range" min={0} max={1000} value={seekPct} aria-label="Seek"
        onChange={(e) => seekTo(Number(e.target.value) / 1000)}
        style={{ flex: "1 1 80px", minWidth: 60, background: sliderBg(seekPct, 0, 1000, "#7c3aed", "#06b6d4") }} />
      <span style={{ fontFamily: "monospace", fontSize: 12, color: C.dim, whiteSpace: "nowrap" }}>{fmt(duration)}</span>

      {/* Volume */}
      <button onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}
        style={{ background: "none", border: "none", color: muted ? C.error : C.muted, fontSize: 16, cursor: "pointer", padding: "0 2px" }}>
        {muted ? "🔇" : volume < 0.4 ? "🔉" : "🔊"}
      </button>
      <input type="range" min={0} max={1} step={0.02} value={muted ? 0 : volume} aria-label="Volume"
        onChange={(e) => changeVolume(Number(e.target.value))}
        style={{ width: 72, background: sliderBg(muted ? 0 : volume, 0, 1, "#7c3aed", "#a78bfa") }} />

      {/* Speed */}
      <span style={{ fontSize: 11, color: C.dim, whiteSpace: "nowrap" }}>Speed</span>
      <input type="range" min={0.5} max={2} step={0.1} value={speed} aria-label="Playback speed"
        onChange={(e) => setSpeed(Number(e.target.value))}
        style={{ width: 72, background: sliderBg(speed, 0.5, 2, "#06b6d4", "#22d3ee") }} />
      <button onClick={() => setSpeed(1)} title="Reset speed to 1×"
        style={badge(speed !== 1, { padding: "3px 8px", cursor: "pointer" })}>
        {speed.toFixed(1)}×
      </button>

      {children}
    </div>
  );
}
