import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/editor",
    },
    sitemap: "https://mp3-studio.vercel.app/sitemap.xml",
  };
}
