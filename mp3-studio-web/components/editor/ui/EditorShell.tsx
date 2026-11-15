/** Page chrome around the editor: ambient background orbs, sticky top bar, content column. */

import type { ReactNode } from "react";
import Link from "next/link";
import { C } from "../theme";

const orb = (size: number, color: string, pos: React.CSSProperties): React.CSSProperties => ({
  position: "fixed", width: size, height: size, borderRadius: "50%", filter: "blur(90px)",
  background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
  pointerEvents: "none", zIndex: 0, ...pos,
});

export function EditorShell({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, paddingBottom: 80, position: "relative", overflow: "hidden" }}>
      {/* Ambient background orbs (same as the local app) */}
      <div style={orb(520, "rgba(124,58,237,.18)", { top: -180, left: -180 })} />
      <div style={orb(420, "rgba(6,182,212,.12)", { bottom: -160, right: -160 })} />
      <div style={orb(300, "rgba(29,78,216,.10)", { top: "40%", left: "50%", transform: "translate(-50%,-50%)" })} />

      {/* Content (above the orbs) */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px clamp(12px,4vw,48px)", borderBottom: `1px solid ${C.border}`, background: "rgba(6,6,15,0.95)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
          <Link href="/" style={{ fontWeight: 900, fontSize: 17, textDecoration: "none" }}>
            <span style={{ background: "linear-gradient(135deg,#9d67f5,#06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>MP3</span>
            {" "}<span style={{ color: C.text }}>Studio</span>
          </Link>
          <span style={{ color: C.dim, fontSize: 12 }}>All processing runs in your browser — nothing is uploaded</span>
        </nav>

        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px clamp(12px,3vw,40px)", display: "flex", flexDirection: "column", gap: 16 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
