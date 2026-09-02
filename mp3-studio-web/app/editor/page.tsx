/**
 * app/editor/page.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The editor route. This is a server component that renders metadata and then
 * hands off to AudioEditor (a client component) for all interactive work.
 *
 * NOTE: AudioEditor is "use client" because it uses browser APIs:
 *   WaveSurfer.js, Web Audio API, FFmpeg.wasm, File API, etc.
 */

import type { Metadata } from "next";
import dynamic from "next/dynamic";
import FeedbackWidget from "@/components/FeedbackWidget";

// Dynamically import AudioEditor with no SSR — keeps WaveSurfer + FFmpeg
// out of the initial JS bundle entirely. They only load in the browser,
// after the page shell is interactive.
const AudioEditor = dynamic(() => import("@/components/editor/AudioEditor"), {
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

export const metadata: Metadata = {
  title: "Audio Editor – MP3 Studio",
  description: "Trim and export your audio files for free. Runs entirely in your browser.",
  robots: { index: false }, // Don't index the app shell — only index the landing page
};

export default function EditorPage() {
  return (
    <>
      <AudioEditor />
      <FeedbackWidget />
    </>
  );
}
