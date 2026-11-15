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
 * CRITICAL: FFmpeg.wasm uses SharedArrayBuffer, which requires these two headers
 * on EVERY response. Without them, FFmpeg will fail silently in the browser.
 *
 * These are set on Vercel automatically when you add them here.
 */
const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_FFMPEG_CORE_VERSION: FFMPEG_CORE_VERSION,
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
      ],
    },
    {
      // Versioned path → safe to cache for a year without revalidation.
      source: "/ffmpeg/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    },
  ],
};

export default nextConfig;
