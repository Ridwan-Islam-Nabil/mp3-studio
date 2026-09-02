"use client";
import dynamic from "next/dynamic";

const AudioEditor = dynamic(() => import("./AudioEditor"), {
  ssr: false,
  loading: () => (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100vh", background: "#06060f", color: "#94a3b8",
      fontSize: 15, fontFamily: "Inter, system-ui, sans-serif", gap: 12,
    }}>
      <span style={{ fontSize: 22 }}>🎵</span> Loading editor…
    </div>
  ),
});

export default function EditorLoader() {
  return <AudioEditor />;
}
