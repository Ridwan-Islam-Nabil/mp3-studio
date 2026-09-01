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
import AudioEditor from "@/components/editor/AudioEditor";
import FeedbackWidget from "@/components/FeedbackWidget";

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
