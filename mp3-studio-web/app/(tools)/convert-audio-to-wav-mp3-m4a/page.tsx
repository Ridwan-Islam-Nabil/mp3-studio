import ToolPage, { toolMetadata } from "@/components/site/ToolPage";

// Content lives in lib/tools.ts; this file only gives the page its static route.
const SLUG = "convert-audio-to-wav-mp3-m4a";

export const metadata = toolMetadata(SLUG);

export default function Page() {
  return <ToolPage slug={SLUG} />;
}
