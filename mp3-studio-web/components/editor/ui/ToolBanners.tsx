/**
 * Banners for shareable tool links (`?tool=`, see toolParams.ts):
 *   - ToolLinkIntro  above the drop zone, before a file is loaded: what the link set up.
 *   - SilencePrompt  after a file loads with `?tool=remove-silence`: one-click "Detect silence"
 *                    (never runs on its own).
 * Wording stays neutral and general (no specific content types).
 */

import { IPHONE_RINGTONE_MAX_SEC } from "@/lib/ffmpeg";
import type { ToolLink } from "../toolParams";
import { C, ghostBtn, primaryBtn } from "../theme";

const box: React.CSSProperties = {
  background: "rgba(6,182,212,0.07)", border: "1px solid rgba(6,182,212,0.45)", borderRadius: 12,
  padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
};

function introText(link: ToolLink): { icon: string; title: string; body: string } {
  switch (link.tool) {
    case "remove-silence":
      return { icon: "🔇", title: "Remove silence", body: "Open an audio file, then click “Detect silence” to mark the quiet parts as cuts. You can review every cut before exporting." };
    case "normalize":
      return { icon: "📶", title: "Normalize loudness", body: "Normalize is on: Preview and Export even out the volume to a standard loudness." };
    case "ringtone":
      return link.device === "android"
        ? { icon: "🔔", title: "Make a ringtone", body: "Ringtone mode is on (Android, MP3). Open a song, mark the part you want, and export it." }
        : { icon: "🔔", title: "Make a ringtone", body: `Ringtone mode is on (iPhone, M4R). Open a song and keep the part you want — up to ${IPHONE_RINGTONE_MAX_SEC} seconds for iPhone.` };
    case "convert":
      return { icon: "🎚", title: "Convert audio", body: `Open a file and export it as ${(link.format ?? "MP3").toUpperCase()}. You can pick another format under Tools.` };
    case "keep":
      return { icon: "✓", title: "Keep mode", body: "Mark the parts you want to keep (green). Everything else is removed on export." };
    case "split":
      return { icon: "✂", title: "Split audio", body: "Open a file and mark the parts. Each part has its own ⬇ Export button, so you can save them one by one." };
  }
}

export function ToolLinkIntro({ link }: { link: ToolLink }) {
  const { icon, title, body } = introText(link);
  return (
    <div data-testid="tool-link-intro" data-tool={link.tool} role="note" style={box}>
      <span aria-hidden style={{ fontSize: 22 }}>{icon}</span>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <strong style={{ fontSize: 14, color: C.text }}>{title}</strong>
        <p style={{ margin: "2px 0 0", fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{body}</p>
      </div>
      <span style={{ fontSize: 11, color: C.dim }}>Free · no sign-up · your file stays on your device</span>
    </div>
  );
}

interface PromptProps {
  onDetect: () => void;
  onDismiss: () => void;
  disabled: boolean;
}

export function SilencePrompt({ onDetect, onDismiss, disabled }: PromptProps) {
  return (
    <div data-testid="silence-prompt" role="region" aria-label="Remove silence" style={box}>
      <span aria-hidden style={{ fontSize: 20 }}>🔇</span>
      <p style={{ margin: 0, flex: "1 1 220px", fontSize: 13, color: C.text, lineHeight: 1.5 }}>
        Ready to remove silence? Quiet parts will be marked as cuts — nothing is removed until you export.
      </p>
      <button type="button" onClick={onDetect} disabled={disabled} style={primaryBtn({ padding: "8px 16px" })}>
        Detect silence
      </button>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" style={ghostBtn({ padding: "6px 10px" })}>×</button>
    </div>
  );
}
