import { describe, expect, it } from "vitest";
import { getPostBySlug, posts } from "./posts";
import { SITE_URL } from "./site";
import { EDITOR_DEVICES, EDITOR_TOOL_IDS, editorHref, getToolBySlug, toolJsonLd, tools, type Tool } from "./tools";

const each = tools.map((t) => [t.slug, t] as const);

/** The fixed page → editor-link contract with the editor (see lib/tools.ts). */
const CONTRACT: Record<string, string> = {
  "remove-silence-from-audio": "/editor?tool=remove-silence",
  "normalize-audio-volume-online": "/editor?tool=normalize",
  "iphone-ringtone-maker": "/editor?tool=ringtone",
  "android-ringtone-maker": "/editor?tool=ringtone&device=android",
  "split-audio-into-parts": "/editor?tool=split",
  "convert-audio-to-wav-mp3-m4a": "/editor?tool=convert",
  "trim-voice-note": "/editor",
  "cut-lecture-recording": "/editor?tool=remove-silence",
};

/** Every piece of copy on a tool page, for text-wide checks. */
function allText(t: Tool): string {
  return [
    t.title, t.description, t.h1, t.navLabel, t.summary, t.ctaLabel, ...t.keywords, ...t.intro,
    ...t.steps.flatMap((s) => [s.name, s.text]), ...t.notes, ...t.faqs.flatMap((f) => [f.q, f.a]),
  ].join("\n");
}

describe("tool pages data", () => {
  it("has exactly the contracted pages", () => {
    expect(tools.map((t) => t.slug).sort()).toEqual(Object.keys(CONTRACT).sort());
  });

  it("has unique slugs, titles, descriptions and H1s", () => {
    for (const key of ["slug", "title", "description", "h1", "navLabel"] as const) {
      const values = tools.map((t) => t[key].toLowerCase());
      expect(new Set(values).size, key).toBe(values.length);
    }
  });

  it("titles and descriptions don't collide with the blog", () => {
    const blogTitles = new Set(posts.map((p) => p.title.toLowerCase()));
    const blogDescriptions = new Set(posts.map((p) => p.description.toLowerCase()));
    for (const t of tools) {
      expect(blogTitles.has(t.title.toLowerCase())).toBe(false);
      expect(blogDescriptions.has(t.description.toLowerCase())).toBe(false);
    }
  });

  it("slugs don't shadow other top-level routes", () => {
    for (const t of tools) expect(["editor", "blog", "sitemap.xml", "robots.txt"]).not.toContain(t.slug);
  });

  it.each(each)("%s: slug is URL-safe", (slug) => {
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it.each(each)("%s: required fields are present and sized for search results", (_slug, t) => {
    for (const s of [t.title, t.description, t.h1, t.navLabel, t.summary, t.ctaLabel]) expect(s.trim()).not.toBe("");
    expect(t.title.length).toBeLessThanOrEqual(65);
    expect(t.description.length).toBeGreaterThanOrEqual(100);
    expect(t.description.length).toBeLessThanOrEqual(165);
    expect(t.intro.length).toBeGreaterThan(0);
    expect(t.keywords.length).toBeGreaterThan(0);
    expect(t.steps.length).toBeGreaterThanOrEqual(3);
    expect(t.steps.length).toBeLessThanOrEqual(5);
    expect(t.faqs.length).toBeGreaterThanOrEqual(4);
    expect(t.faqs.length).toBeLessThanOrEqual(6);
    for (const s of t.steps) expect(s.name.trim() && s.text.trim()).toBeTruthy();
    for (const f of t.faqs) expect(f.q.trim() && f.a.trim()).toBeTruthy();
    expect(new Set(t.faqs.map((f) => f.q)).size).toBe(t.faqs.length);
    const d = new Date(t.updated + "T00:00:00Z");
    expect(d.toISOString().slice(0, 10)).toBe(t.updated);
  });

  it.each(each)("%s: editor link matches the contract and uses only valid ids", (slug, t) => {
    const href = editorHref(t.editor);
    expect(href).toBe(CONTRACT[slug]);
    const url = new URL(href, "https://example.com");
    expect(url.pathname).toBe("/editor");
    for (const key of url.searchParams.keys()) expect(["tool", "device"]).toContain(key);
    const tool = url.searchParams.get("tool");
    if (tool !== null) expect(EDITOR_TOOL_IDS as readonly string[]).toContain(tool);
    const device = url.searchParams.get("device");
    if (device !== null) {
      expect(EDITOR_DEVICES as readonly string[]).toContain(device);
      expect(tool).toBe("ringtone");
    }
  });

  it.each(each)("%s: related tools and posts exist", (slug, t) => {
    expect(t.related.length).toBeGreaterThan(0);
    for (const r of t.related) {
      expect(r).not.toBe(slug);
      expect(getToolBySlug(r), r).toBeDefined();
    }
    expect(t.relatedPosts.length).toBeGreaterThan(0);
    for (const p of t.relatedPosts) expect(getPostBySlug(p), p).toBeDefined();
  });

  it.each(each)("%s: copy never markets Quran recitation (owners' rule)", (_slug, t) => {
    expect(allText(t)).not.toMatch(/qur'?an|koran/i);
  });

  it("the iPhone page mentions the 40-second limit and M4R", () => {
    const t = getToolBySlug("iphone-ringtone-maker")!;
    expect(allText(t)).toMatch(/40 seconds/);
    expect(allText(t)).toMatch(/m4r/i);
  });

  it("the split page says parts are exported one at a time", () => {
    expect(allText(getToolBySlug("split-audio-into-parts")!)).toMatch(/one at a time/);
  });

  it("the voice-note page names the .opus and .ogg formats", () => {
    const text = allText(getToolBySlug("trim-voice-note")!);
    expect(text).toMatch(/\.opus/);
    expect(text).toMatch(/\.ogg/);
  });

  it("getToolBySlug returns undefined for unknown slugs", () => {
    expect(getToolBySlug("nope")).toBeUndefined();
  });
});

describe("tool page JSON-LD", () => {
  it.each(each)("%s: HowTo, FAQPage and BreadcrumbList are valid JSON with the page's data", (slug, t) => {
    const blocks = toolJsonLd(t).map((b) => JSON.parse(JSON.stringify(b)));
    expect(blocks.map((b) => b["@type"])).toEqual(["HowTo", "FAQPage", "BreadcrumbList"]);
    for (const b of blocks) expect(b["@context"]).toBe("https://schema.org");

    const [howTo, faq, crumbs] = blocks;
    const pageUrl = `${SITE_URL}/${slug}`;
    expect(howTo.url).toBe(pageUrl);
    expect(howTo.name).toBe(t.h1);
    expect(howTo.step).toHaveLength(t.steps.length);
    howTo.step.forEach((s: Record<string, unknown>, i: number) => {
      expect(s["@type"]).toBe("HowToStep");
      expect(s.position).toBe(i + 1);
      expect(s.name).toBe(t.steps[i].name);
      expect(s.text).toBe(t.steps[i].text);
      expect(s.url).toBe(`${pageUrl}#step-${i + 1}`);
    });

    expect(faq.mainEntity).toHaveLength(t.faqs.length);
    faq.mainEntity.forEach((q: { name: string; acceptedAnswer: { "@type": string; text: string } }, i: number) => {
      expect(q.name).toBe(t.faqs[i].q);
      expect(q.acceptedAnswer["@type"]).toBe("Answer");
      expect(q.acceptedAnswer.text).toBe(t.faqs[i].a);
    });

    expect(crumbs.itemListElement.at(-1).item).toBe(pageUrl);
  });
});
