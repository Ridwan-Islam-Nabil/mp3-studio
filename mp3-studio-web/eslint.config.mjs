import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // AudioEditor reads zoomMinRef.current during render (zoom badge). It is a known issue,
  // kept as a warning (not an error) so CI can gate on lint until the wave-2 refactor of
  // AudioEditor.tsx fixes it — then delete this override.
  {
    files: ["components/editor/AudioEditor.tsx"],
    rules: { "react-hooks/refs": "warn" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Self-hosted FFmpeg core, copied from node_modules (scripts/copy-ffmpeg-core.mjs)
    "public/ffmpeg/**",
  ]),
]);

export default eslintConfig;
