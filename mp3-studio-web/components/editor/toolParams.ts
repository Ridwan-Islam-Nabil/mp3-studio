/**
 * Shareable tool links: `/editor?tool=<id>` pre-configures the editor for one tool. This is a
 * contract with the SEO landing pages (each feature page links to the editor with its tool id),
 * so the ids and parameters below must not change without updating those pages.
 *
 *   ?tool=remove-silence            Remove silence highlighted; after a file loads, a one-click
 *                                   "Detect silence" prompt (never runs on its own)
 *   ?tool=normalize                 Normalize loudness on
 *   ?tool=ringtone[&device=android] Ringtone mode on: iPhone M4R (default) or Android MP3
 *   ?tool=convert[&format=wav|m4a|mp3]  Format picker highlighted, format preselected
 *   ?tool=keep                      Keep mode on (mark what to keep)
 *   ?tool=split                     Per-section "Export" buttons highlighted, with a hint
 *
 * Unknown or missing values → null (today's default editor). Nothing runs until the user loads
 * a file. Pure (no React, no DOM globals) — unit-tested in toolParams.test.ts.
 */

/** Every valid `?tool=` value, in the order the Tools panel shows them. */
export const TOOL_IDS = ["remove-silence", "normalize", "ringtone", "convert", "keep", "split"] as const;

export type ToolId = (typeof TOOL_IDS)[number];

export type RingtoneDevice = "iphone" | "android";

/** Formats `?tool=convert&format=` may preselect. */
export const CONVERT_FORMATS = ["mp3", "wav", "m4a"] as const;
export type ConvertFormat = (typeof CONVERT_FORMATS)[number];

export interface ToolLink {
  tool: ToolId;
  /** Only for `ringtone`; defaults to "iphone". */
  device?: RingtoneDevice;
  /** Only for `convert`, and only when `&format=` names a supported format. */
  format?: ConvertFormat;
}

export function isToolId(value: unknown): value is ToolId {
  return typeof value === "string" && (TOOL_IDS as readonly string[]).includes(value);
}

const clean = (v: string | null) => (v ?? "").trim().toLowerCase();

/**
 * Parses the query string of an editor URL (`"?tool=ringtone&device=android"`, without the "?"
 * too, or a URLSearchParams). Returns null when there is no valid `tool`.
 */
export function parseToolParams(search: string | URLSearchParams | null | undefined): ToolLink | null {
  if (!search) return null;
  let params: URLSearchParams;
  try {
    params = typeof search === "string" ? new URLSearchParams(search) : search;
  } catch {
    return null;
  }
  const tool = clean(params.get("tool"));
  if (!isToolId(tool)) return null;

  if (tool === "ringtone") {
    return { tool, device: clean(params.get("device")) === "android" ? "android" : "iphone" };
  }
  if (tool === "convert") {
    const format = clean(params.get("format"));
    return (CONVERT_FORMATS as readonly string[]).includes(format)
      ? { tool, format: format as ConvertFormat }
      : { tool };
  }
  return { tool };
}

/** Builds the query string for a tool link (used in tests and handy for internal links). */
export function toolLinkQuery(link: ToolLink): string {
  const params = new URLSearchParams({ tool: link.tool });
  if (link.tool === "ringtone" && link.device === "android") params.set("device", "android");
  if (link.tool === "convert" && link.format) params.set("format", link.format);
  return `?${params.toString()}`;
}
