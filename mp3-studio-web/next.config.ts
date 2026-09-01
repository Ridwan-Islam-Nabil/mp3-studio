import type { NextConfig } from "next";

/**
 * CRITICAL: FFmpeg.wasm uses SharedArrayBuffer, which requires these two headers
 * on EVERY response. Without them, FFmpeg will fail silently in the browser.
 *
 * These are set on Vercel automatically when you add them here.
 */
const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
      ],
    },
  ],
};

export default nextConfig;
