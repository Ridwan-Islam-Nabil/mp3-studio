import type { NextConfig } from "next";
import pkg from "./package.json";

/**
 * The self-hosted FFmpeg core lives at /ffmpeg/<version>/ (copied there from
 * node_modules by scripts/copy-ffmpeg-core.mjs). The version is the exact pin in
 * package.json, exposed to lib/ffmpeg.ts at build time, so upgrading the package
 * changes the URL and the immutable cache below can never serve a stale core.
 */
const FFMPEG_CORE_VERSION = pkg.dependencies["@ffmpeg/core"];

/**
 * COOP/COEP make the page cross-origin isolated (SharedArrayBuffer available). Only the
 * multi-threaded FFmpeg core needs that; the single-threaded core we load works without
 * them — see "The COOP/COEP headers" in CLAUDE.md for the cross-browser results.
 *
 * DISABLE_COI=1 omits them (for testing). Headers are compiled at BUILD time, so set it
 * for `next build`, not just `next start`. Default: headers on.
 */
const COI_HEADERS = process.env.DISABLE_COI === "1"
  ? []
  : [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_FFMPEG_CORE_VERSION: FFMPEG_CORE_VERSION,
  },
  headers: async () => [
    ...COI_HEADERS,
    {
      // Versioned path → safe to cache for a year without revalidation.
      source: "/ffmpeg/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    },
  ],
};

export default nextConfig;
