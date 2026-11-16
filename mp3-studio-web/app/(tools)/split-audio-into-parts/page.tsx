import ToolPage, { toolMetadata } from "@/components/site/ToolPage";

// Content lives in lib/tools.ts; this file only gives the page its static route.
const SLUG = "split-audio-into-parts";

export const metadata = toolMetadata(SLUG);

export default function Page() {
  return <ToolPage slug={SLUG} />;
}
