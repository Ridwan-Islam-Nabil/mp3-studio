import { describe, expect, it } from "vitest";
import { jsonLdString } from "./seo";
import { DEFAULT_SITE_URL, SITE_URL, absoluteUrl, resolveSiteUrl } from "./site";

describe("resolveSiteUrl", () => {
  it("falls back to the Vercel URL when unset, empty or invalid", () => {
    expect(resolveSiteUrl(undefined)).toBe(DEFAULT_SITE_URL);
    expect(resolveSiteUrl("")).toBe(DEFAULT_SITE_URL);
    expect(resolveSiteUrl("   ")).toBe(DEFAULT_SITE_URL);
    expect(resolveSiteUrl("not a url")).toBe(DEFAULT_SITE_URL);
    expect(resolveSiteUrl("ftp://example.com")).toBe(DEFAULT_SITE_URL);
  });

  it("uses a configured origin and strips trailing slashes", () => {
    expect(resolveSiteUrl("https://example.com")).toBe("https://example.com");
    expect(resolveSiteUrl("https://example.com/")).toBe("https://example.com");
    expect(resolveSiteUrl(" https://Example.com// ")).toBe("https://example.com");
    expect(resolveSiteUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });
});

describe("absoluteUrl", () => {
  it("joins paths onto SITE_URL", () => {
    expect(absoluteUrl("/")).toBe(SITE_URL);
    expect(absoluteUrl("/blog")).toBe(`${SITE_URL}/blog`);
    expect(absoluteUrl("blog/x")).toBe(`${SITE_URL}/blog/x`);
    expect(SITE_URL.endsWith("/")).toBe(false);
  });
});

describe("jsonLdString", () => {
  it("round-trips through JSON.parse and can't close a script tag", () => {
    const data = { text: "</script><script>alert(1)</script>" };
    const s = jsonLdString(data);
    expect(s).not.toContain("</script");
    expect(JSON.parse(s)).toEqual(data);
  });
});
