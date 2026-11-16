import { describe, expect, it } from "vitest";
import { posts } from "@/lib/posts";
import { SITE_URL } from "@/lib/site";
import { tools } from "@/lib/tools";
import robots from "./robots";
import sitemap from "./sitemap";

describe("sitemap", () => {
  const urls = sitemap().map((e) => e.url);

  it("lists the home page, the blog and every post", () => {
    expect(urls).toContain(SITE_URL);
    expect(urls).toContain(`${SITE_URL}/blog`);
    for (const p of posts) expect(urls).toContain(`${SITE_URL}/blog/${p.slug}`);
  });

  it("lists every tool page", () => {
    for (const t of tools) expect(urls).toContain(`${SITE_URL}/${t.slug}`);
  });

  it("has no duplicates, only absolute URLs on SITE_URL, and never the editor", () => {
    expect(new Set(urls).size).toBe(urls.length);
    for (const u of urls) {
      expect(u === SITE_URL || u.startsWith(`${SITE_URL}/`)).toBe(true);
      expect(u).not.toMatch(/\/editor/);
    }
  });

  it("has valid lastModified dates", () => {
    for (const e of sitemap()) expect(Number.isNaN(new Date(e.lastModified!).getTime())).toBe(false);
  });
});

describe("robots", () => {
  it("disallows only /editor and points at the sitemap on SITE_URL", () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    expect(rules).toHaveLength(1);
    expect(rules[0].userAgent).toBe("*");
    expect(rules[0].allow).toBe("/");
    expect(rules[0].disallow).toBe("/editor");
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});
