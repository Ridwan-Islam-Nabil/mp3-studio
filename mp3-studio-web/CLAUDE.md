# CLAUDE.md — MP3 Studio Web

> **Read this entire file before making any changes.**
> It explains the architecture, every key design decision, and how to deploy.

---

## What This Project Is

A **free hosted web app** for trimming and exporting audio files.  
Users upload audio, drag on a waveform to mark sections to remove, and export a clean MP3.

**The key architectural decision: FFmpeg runs in the user's browser** (WebAssembly).  
There is no backend server. No file uploads to any server. Zero hosting cost for audio processing.

**Tech stack:**
- **Framework:** Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Audio processing:** `@ffmpeg/ffmpeg` v0.12 (FFmpeg WebAssembly, runs in browser)
- **Waveform:** WaveSurfer.js v7
- **Hosting:** Vercel (free tier, no credit card required)
- **Analytics:** PostHog (free tier, optional)

---

## File Structure

```
mp3-studio-web/
├── app/
│   ├── layout.tsx          ← Root layout — SEO metadata, Inter font, global CSS
│   ├── page.tsx            ← Landing page (SSR, SEO-optimized, no interactivity)
│   ├── globals.css         ← CSS custom properties, glass card, button styles
│   └── editor/
│       └── page.tsx        ← Editor route (thin shell, imports AudioEditor)
├── components/
│   └── editor/
│       └── AudioEditor.tsx ← Main editor — all state, WaveSurfer, export logic
├── lib/
│   └── ffmpeg.ts           ← FFmpeg.wasm wrapper (invertRegions, trimAndExport)
├── next.config.ts          ← CRITICAL: sets COOP/COEP headers for SharedArrayBuffer
├── package.json
└── CLAUDE.md               ← This file
```

---

## How FFmpeg.wasm Works

Normal web apps upload audio to a server, process it with FFmpeg, and send it back.  
This app skips the server entirely:

1. User drops a file → browser holds it in memory (never sent anywhere)
2. On first export: browser downloads ~30MB of FFmpeg WebAssembly from unpkg CDN
3. FFmpeg runs inside the browser tab — extracts kept segments, concatenates them
4. Browser downloads the result directly

**Result:** zero server cost, fully private, works offline after first use.

### The COOP/COEP headers (non-negotiable)

FFmpeg.wasm uses `SharedArrayBuffer`, which browsers block unless these two headers are on every response:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These are set in `next.config.ts`. **Never remove them.** If you do, FFmpeg will fail silently.

---

## How Cut Regions Work

The UI marks sections to **DELETE** (shown in red on the waveform).  
On export, `invertRegions()` in `lib/ffmpeg.ts` flips them to find what to **keep**.

Example:
```
Audio:   |──────────────────────────────────────────|  (60 seconds)
Cuts:               [10–20]         [40–50]
Keep:    [0–10]             [20–40]         [50–60]
```

FFmpeg extracts each kept segment as `seg_0.mp3`, `seg_1.mp3`, etc., then concatenates.

---

## State Architecture

All state lives in `AudioEditor.tsx` as React `useState` hooks.  
There is no global state manager (no Redux, no Zustand).

```
file          → the raw File object from the browser
fileUrl       → URL.createObjectURL(file) — fed to WaveSurfer
duration      → set by WaveSurfer's "ready" event
regions[]     → array of { id, start, end, wsRef } — source of truth for export
isPlaying     → mirrors WaveSurfer's play/pause events
exporting     → true while FFmpeg is running
exportProgress → 0-100 shown on the export button
```

**WaveSurfer (`wsRef`) is a ref, not state.** Mutating it doesn't trigger re-renders.  
Regions are in state because the export logic needs them as plain data.

---

## Module Dependency Rules

```
AudioEditor.tsx
 ├── lib/ffmpeg.ts      (loadFFmpeg, trimAndExport)
 ├── wavesurfer.js      (CDN package)
 └── wavesurfer.js/dist/plugins/regions.js
```

- `lib/ffmpeg.ts` has **no React imports** — it's pure TypeScript
- `AudioEditor.tsx` is the only client component — do not add `"use client"` elsewhere unless necessary

---

## Adding New Features — Guide

### Add a playback speed slider
In `AudioEditor.tsx`, add a state `const [speed, setSpeed] = useState(1)`, then call  
`wsRef.current?.setPlaybackRate(speed)` inside a `useEffect([speed])`.

### Add a minimap
Import `MinimapPlugin` from `wavesurfer.js/dist/plugins/minimap.js` and add it to the  
`plugins` array in the `WaveSurfer.create()` call inside the `useEffect`.

### Add a session save (localStorage)
After regions change, call `localStorage.setItem("regions", JSON.stringify(regions))`.  
On mount, read it back and re-create regions via `wsRegionsRef.current?.addRegion()`.

### Add user auth + usage limits
Install `@supabase/supabase-js` and `@clerk/nextjs`. Clerk handles login UI;  
Supabase stores export counts per user. Both have free tiers with no card required.

### Add PostHog analytics
```ts
import posthog from "posthog-js";
posthog.init("YOUR_KEY", { api_host: "https://us.posthog.com" });
posthog.capture("export_started", { cuts: regions.length, file_type: file.type });
```
Track: `page_landed`, `file_uploaded`, `export_started`, `export_completed`.

---

## How to Deploy (Free, No Credit Card)

### Step 1 — Push to GitHub
1. Create a GitHub account if you don't have one: https://github.com
2. Create a new repository (public or private — both work)
3. Push this folder to it:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/mp3-studio-web.git
   git push -u origin main
   ```

### Step 2 — Deploy on Vercel
1. Go to https://vercel.com and sign up with your GitHub account (free, no card)
2. Click "Add New Project"
3. Import your `mp3-studio-web` repository
4. Leave all settings as default — Vercel auto-detects Next.js
5. Click "Deploy"

Vercel will build and deploy in ~2 minutes. You get a free `.vercel.app` URL.

### Step 3 — Custom domain (optional, free)
- In Vercel project settings → Domains → add your domain
- Or use the free `.vercel.app` domain indefinitely

### Environment variables (none required for MVP)
The core app needs no environment variables.  
If you add PostHog later, add `NEXT_PUBLIC_POSTHOG_KEY` in Vercel's project settings.

---

## Local Development

```bash
npm install
npm run dev
# Open http://localhost:3000
```

The COOP/COEP headers are set in `next.config.ts` — they apply in development too.

---

## Key Design Decisions

**1. FFmpeg in the browser, not a server**  
Zero hosting cost for audio processing. Scales to unlimited users with no extra cost.  
The trade-off: first export is slow (~5–10s to load the wasm binary). Subsequent exports are fast.

**2. No sign-up for MVP**  
Removing friction gets real users fast. Add auth only when you need usage limits or paid tiers.

**3. SSR landing page, client-side editor**  
`app/page.tsx` is a server component → Google can index it for SEO.  
`app/editor/page.tsx` shells into `AudioEditor.tsx` which is `"use client"`.  
The editor has `robots: { index: false }` — Google doesn't index app shells, only landing pages.

**4. Cut regions = sections to DELETE**  
Same convention as the desktop app. Red = danger = cut. Inversion happens at export time in `invertRegions()`.

**5. No bundler customization**  
Plain Next.js with zero webpack config. FFmpeg.wasm loads from unpkg CDN, not the app bundle. This keeps the bundle small and deployment simple.

---

## Things That Will Break If You're Not Careful

1. **Removing the COOP/COEP headers from `next.config.ts`** — FFmpeg will fail silently. Always keep them.

2. **Using WaveSurfer outside a `useEffect`** — WaveSurfer accesses `window` and DOM APIs that don't exist during SSR. It must be initialized inside `useEffect`.

3. **Calling `loadFFmpeg()` on every export** — `loadFFmpeg()` checks `if (loaded) return` and is idempotent. Don't guard it yourself — the check is inside.

4. **Forgetting to call `URL.revokeObjectURL()`** — Every `URL.createObjectURL()` must be revoked when done or it leaks memory. Check `handleFile()` in `AudioEditor.tsx` for the pattern.

5. **Adding server-side code to `AudioEditor.tsx`** — It has `"use client"` at the top. Any import that uses Node.js APIs (fs, path, etc.) will break it.
