import type { Metadata } from "next";
import EditorLoader from "@/components/editor/EditorLoader";
import FeedbackWidget from "@/components/FeedbackWidget";

export const metadata: Metadata = {
  title: "Audio Editor – MP3 Studio",
  description: "Trim and export your audio files for free. Runs entirely in your browser.",
  robots: { index: false },
};

export default function EditorPage() {
  return (
    <>
      <EditorLoader />
      <FeedbackWidget />
    </>
  );
}
