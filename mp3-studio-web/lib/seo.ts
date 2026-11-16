import type { Metadata } from "next";
import { SITE_NAME, absoluteUrl } from "./site";

/** Open Graph / Twitter image (relative: resolved against `metadataBase` in app/layout.tsx). */
export const OG_IMAGE = "/thumbnail.png";

/**
 * Per-page metadata with a canonical URL and matching Open Graph / Twitter cards.
 *
 * Next.js merges metadata shallowly: a page that sets `openGraph` replaces the layout's whole
 * `openGraph` object (images included), so every indexed page should go through this helper.
 * Canonicals are set per page, never in the root layout — a layout canonical would be inherited
 * by every page that forgets to override it and point them all at the home page.
 */
export function pageMetadata({
  title,
  description,
  path,
  keywords,
  type = "website",
  publishedTime,
}: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  type?: "website" | "article";
  publishedTime?: string;
}): Metadata {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    ...(keywords ? { keywords } : {}),
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type,
      locale: "en_US",
      images: [OG_IMAGE],
      ...(publishedTime ? { publishedTime } : {}),
    },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE] },
  };
}

/**
 * Serializes JSON-LD for a `<script type="application/ld+json">`. `<` is escaped so text can
 * never close the script tag early.
 */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
