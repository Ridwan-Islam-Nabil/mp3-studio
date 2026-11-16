/**
 * The site's canonical origin — the single source of truth for absolute URLs (metadataBase,
 * canonical links, Open Graph, JSON-LD, sitemap, robots, blog links).
 *
 * Set `NEXT_PUBLIC_SITE_URL` (e.g. `https://example.com`) when moving to a custom domain. It is
 * read at **build** time (NEXT_PUBLIC_* values are inlined), so rebuild after changing it.
 * No React, no DOM — safe to import from `lib/posts.ts` and from tests.
 */

export const DEFAULT_SITE_URL = "https://mp3-studio.vercel.app";

/** Normalizes a configured origin: trims, drops trailing slashes, falls back on empty/invalid. */
export function resolveSiteUrl(value: string | undefined): string {
  const raw = (value ?? "").trim().replace(/\/+$/, "");
  if (!raw) return DEFAULT_SITE_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return DEFAULT_SITE_URL;
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    return DEFAULT_SITE_URL;
  }
}

/** Canonical origin without a trailing slash, e.g. `https://mp3-studio.vercel.app`. */
export const SITE_URL = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

/** Host shown in copy, e.g. `mp3-studio.vercel.app`. */
export const SITE_HOST = new URL(SITE_URL).host;

export const SITE_NAME = "MP3 Studio";

/** Absolute URL for a site path: `absoluteUrl("/blog")` → `https://…/blog`; `"/"` → the origin. */
export function absoluteUrl(path: string): string {
  if (!path || path === "/") return SITE_URL;
  return SITE_URL + (path.startsWith("/") ? path : `/${path}`);
}
