import { describe, expect, it } from "vitest";
import { getPostBySlug, posts } from "./posts";

describe("blog posts", () => {
  it("has at least one post", () => {
    expect(posts.length).toBeGreaterThan(0);
  });

  it("has unique slugs", () => {
    const slugs = posts.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each(posts.map((p) => [p.slug, p] as const))("%s: slug is URL-safe", (slug) => {
    // lowercase letters, digits and single hyphens; no leading/trailing hyphen
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(encodeURIComponent(slug)).toBe(slug);
  });

  it.each(posts.map((p) => [p.slug, p] as const))("%s: required fields are present", (_slug, post) => {
    expect(post.title.trim()).not.toBe("");
    expect(post.description.trim()).not.toBe("");
    expect(post.content.trim()).not.toBe("");
    expect(Array.isArray(post.keywords)).toBe(true);
    expect(post.keywords.length).toBeGreaterThan(0);
    for (const k of post.keywords) expect(k.trim()).not.toBe("");
  });

  it.each(posts.map((p) => [p.slug, p] as const))("%s: date is a valid YYYY-MM-DD", (_slug, post) => {
    expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const d = new Date(post.date + "T00:00:00Z");
    expect(Number.isNaN(d.getTime())).toBe(false);
    // Rejects impossible dates like 2026-02-31, which Date silently rolls over.
    expect(d.toISOString().slice(0, 10)).toBe(post.date);
  });

  it("getPostBySlug finds every post and returns undefined for unknown slugs", () => {
    for (const p of posts) expect(getPostBySlug(p.slug)).toBe(p);
    expect(getPostBySlug("does-not-exist")).toBeUndefined();
  });
});
