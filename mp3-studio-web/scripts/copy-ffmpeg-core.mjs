/**
 * scripts/copy-ffmpeg-core.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Copies the single-threaded FFmpeg core (ffmpeg-core.js + ffmpeg-core.wasm)
 * from node_modules/@ffmpeg/core/dist/umd/ into public/ffmpeg/<version>/ so the
 * app serves it from its own origin instead of a third-party CDN.
 *
 * Runs on `postinstall` (npm install / npm ci) and on `prebuild` / `predev`
 * (npm run build / dev), so public/ffmpeg/ exists even if install scripts were
 * skipped. public/ffmpeg/ is gitignored — the ~30 MB wasm is never committed.
 *
 * The version in the path comes from the installed package and must equal the
 * exact pin of "@ffmpeg/core" in package.json (next.config.ts exposes that pin to
 * lib/ffmpeg.ts as NEXT_PUBLIC_FFMPEG_CORE_VERSION). Upgrading the package
 * therefore changes the URL, which is what makes the immutable cache safe.
 *
 * Plain Node (fs/path only) so it runs the same on Windows, macOS, Linux, CI
 * and Vercel.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = path.join(root, "node_modules", "@ffmpeg", "core");
const srcDir = path.join(pkgDir, "dist", "umd");
const outRoot = path.join(root, "public", "ffmpeg");
const FILES = ["ffmpeg-core.js", "ffmpeg-core.wasm"];

function fail(msg) {
  console.error(`[copy-ffmpeg-core] ${msg}`);
  process.exit(1);
}

if (!existsSync(pkgDir)) fail("node_modules/@ffmpeg/core is missing — run `npm install` first.");

const installed = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8")).version;
const pinned = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).dependencies?.["@ffmpeg/core"];
if (pinned !== installed) {
  fail(
    `package.json pins @ffmpeg/core "${pinned}" but ${installed} is installed. ` +
      `Pin an exact version (no ^ or ~) and reinstall.`
  );
}

const outDir = path.join(outRoot, installed);
mkdirSync(outDir, { recursive: true });

let copied = 0;
for (const name of FILES) {
  const src = path.join(srcDir, name);
  const dst = path.join(outDir, name);
  if (!existsSync(src)) fail(`${path.relative(root, src)} not found.`);
  if (existsSync(dst) && statSync(dst).size === statSync(src).size) continue; // already up to date
  copyFileSync(src, dst);
  copied++;
}

// Remove folders left over from older core versions.
for (const entry of readdirSync(outRoot, { withFileTypes: true })) {
  if (entry.name !== installed) rmSync(path.join(outRoot, entry.name), { recursive: true, force: true });
}

console.log(
  `[copy-ffmpeg-core] public/ffmpeg/${installed}/ ${copied ? `updated (${copied} file(s))` : "already up to date"}`
);
