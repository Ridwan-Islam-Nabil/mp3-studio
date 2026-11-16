/**
 * Contract between the landing pages (lib/tools.ts) and the editor (components/editor/toolParams.ts):
 * every landing-page CTA must open the editor with exactly the tool the page promises.
 * The two sides were built separately, so this test is what keeps them in sync.
 */
import { describe, expect, it } from "vitest";
import { EDITOR_TOOL_IDS, editorHref, tools } from "@/lib/tools";
import { TOOL_IDS, parseToolParams } from "@/components/editor/toolParams";

describe("landing page ↔ editor tool-link contract", () => {
  it("every tool id a landing page can use is one the editor understands", () => {
    for (const id of EDITOR_TOOL_IDS) expect(TOOL_IDS).toContain(id);
  });

  it.each(tools.map((t) => [t.slug, t] as const))("/%s CTA preselects its tool", (_slug, tool) => {
    const href = editorHref(tool.editor);
    expect(href.startsWith("/editor")).toBe(true);
    const parsed = parseToolParams(href.split("?")[1] ?? "");

    if (!tool.editor.tool) {
      expect(parsed).toBeNull(); // plain editor
      return;
    }
    expect(parsed?.tool).toBe(tool.editor.tool);
    if (tool.editor.tool === "ringtone") {
      expect(parsed?.device).toBe(tool.editor.device ?? "iphone");
    }
  });
});
