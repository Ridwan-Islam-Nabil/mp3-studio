# CLAUDE.md — MP3 Studio Web

> **Read this entire file before making any changes.**
> It explains the architecture, every key design decision, and how to deploy.
>
> This folder is the hosted web version. The original local Flask app lives in the repo root
> (see `../CLAUDE.md`). The two share a visual design and the "cut regions = parts to delete"
> convention, but **no code** — changes to one do not affect the other.

---

## What This Project Is

A **free hosted web app** for trimming and exporting audio files, live at
`https://mp3-studio.vercel.app`.
Users upload audio, drag on a waveform to mark sections to remove, and export a clean MP3.

**The key architectural decision: FFmpeg runs in the user's browser** (WebAssembly).
There is no backend server. No file uploads to any server. Zero hosting cost for audio processing.

Unlike the local app, there is **no YouTube download** here — upload only.

**Tech stack:**
- **Framework:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Audio processing:** `@ffmpeg/ffmpeg` v0.12 (FFmpeg WebAssembly, runs in browser)
- **Waveform:** WaveSurfer.js v7 (npm) with Regions, Timeline and Minimap plugins
- **Hosting:** Vercel (free tier)
- **Analytics:** PostHog (optional — disabled unless the env var is set)

---

## File Structure

```
mp3-studio-web/
├── app/
│   ├── layout.tsx            ← Root layout — SEO metadata, keywords, Google/Bing verification,
│   │                            Inter font, wraps everything in <PostHogProvider>
│   ├── page.tsx              ← Landing page (server component, SEO copy, FAQ, JSON-LD)
│   ├── globals.css           ← CSS custom properties, glass card, button styles
│   ├── sitemap.ts            ← Generates /sitemap.xml (home, /blog, every post)
│   ├── robots.ts             ← Generates /robots.txt (disallows /editor)
│   ├── editor/
│   │   └── page.tsx          ← Editor route: <EditorLoader/> + <FeedbackWidget/>, noindex
│   └── blog/
│       ├── page.tsx          ← Blog index (server component)
│       └── [slug]/page.tsx   ← Blog post (generateStaticParams + generateMetadata + JSON-LD)
├── components/
│   ├── PostHogProvider.tsx   ← "use client" — calls initPostHog() once on mount
│   ├── FeedbackWidget.tsx    ← "use client" — floating feedback button/modal → PostHog event
│   └── editor/
│       ├── EditorLoader.tsx  ← "use client" — next/dynamic import of AudioEditor, ssr: false
│       └── AudioEditor.tsx   ← "use client" — the whole editor: state, WaveSurfer, preview, export
├── lib/
│   ├── ffmpeg.ts             ← FFmpeg.wasm wrapper (loadFFmpeg, invertRegions, trimAndExport)
│   ├── analytics.ts          ← PostHog init + typed track*() helpers
│   └── posts.ts              ← Blog post content (array of Post objects, HTML strings)
├── public/
│   ├── screenshots/          ← Editor screenshots used on the landing page
│   ├── thumbnail.png         ← Open Graph image
│   └── icon-192.png
├── next.config.ts            ← Sets COOP/COEP headers on every response
├── package.json
└── CLAUDE.md                 ← This file
```

---

## How FFmpeg.wasm Works

Normal web apps upload audio to a server, process it with FFmpeg, and send it back.
This app skips the server entirely:

1. User drops a file → browser holds it in memory (never sent anywhere)
2. On the **first Preview or Export**, `loadFFmpeg()` downloads the FFmpeg core
   (`@ffmpeg/core@0.12.6`, single-threaded UMD build, ~30 MB) from unpkg via `toBlobURL`
3. `trimAndExport()` writes the file into FFmpeg's in-memory filesystem, re-encodes each kept
   segment to `seg_N.mp3` (libmp3lame, VBR `-q:a 2`, 44.1 kHz), then joins them with the
   concat demuxer (`-c copy`)
4. The result comes back as a `Blob`; the editor triggers a download via a temporary `<a download>`

Progress reporting: in `AudioEditor.runFFmpeg()`, loading maps to 0–20% and trimming to 20–100%.

**Limits to keep in mind:** the entire source file plus every segment lives in WebAssembly
memory, so very large/long uncompressed files (WAV, FLAC) are where this will fail first.

### The COOP/COEP headers

`next.config.ts` sets these on every response:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

They were added because multi-threaded FFmpeg.wasm needs `SharedArrayBuffer`. The app currently
loads the **single-threaded** core, which may not strictly require them — but this has not been
tested. **Do not remove them without testing Preview and Export in Chrome, Firefox and Safari
on the deployed site.** Also note that `require-corp` blocks third-party resources (images,
iframes, scripts) that don't send CORS/CORP headers — keep that in mind when embedding anything.

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

With zero cuts, the whole file is kept (one segment, no concat step). Preview and Export are
available as soon as audio loads.

Ways to create a cut:
- Drag on the waveform (`enableDragSelection`)
- **Mark to Cut** button — drops a 10 s region centered on the playhead

All region creation goes through WaveSurfer's `region-created` event, which updates React state
and pushes history. Regions can be dragged/resized (`region-updated`) and removed from the list.

---

## Editor Features (AudioEditor.tsx)

- Drag-and-drop or browse upload
- Waveform (460 px tall, purple→blue gradient), top timeline ruler, overview minimap
- Hover cursor with time readout
- Logarithmic zoom slider, calibrated per file (see below), up to 2000 px/sec
- Play/pause, ±5 s skip, seek bar, volume + mute, playback speed
- Undo / redo of region changes
- Preview modal (HTML5 `<audio>` of the merged result) with download
- Output filename input (used as the download name)
- Fullscreen waveform (Esc exits)

**Not implemented here (exists only in the local app):** keyboard shortcuts other than Esc,
session auto-save to localStorage, region loop / mini-player, light theme, YouTube download.

### Zoom calibration
Same idea as the local app: after `ready`, the editor measures
`container.offsetWidth / duration` (the natural fit-to-view px/sec) and stores
`zoomMinRef.current` just above it. `sliderToZoom(s, zoomMin)` maps slider 0–100 onto a log curve
from `zoomMin` to `ZOOM_MAX` (2000), so position 0 always produces a visible zoom.

### Styling
The editor uses **inline styles** driven by a `C` color object at the top of the file (same palette
as the local app: `#06060f` background, `#7c3aed` purple, `#06b6d4` cyan). The landing page and
blog use Tailwind + `globals.css`.

---

## State Architecture

All editor state lives in `AudioEditor.tsx`. There is no global state manager.

```
file, fileUrl          → File object + its object URL (fed to WaveSurfer)
duration, currentTime  → from WaveSurfer events
outputName             → download filename (without .mp3)
isPlaying, speed, volume, muted, zoomSlider, cursorTime, fullscreen
regions[]              → { id, start, end, wsRef } — source of truth for export
hist (useReducer)      → { history: RegionData[][], ptr } — undo/redo snapshots
exporting / exportProgress / exportDone
previewing / previewProgress / previewUrl / showPreview
dragging               → drop-zone highlight
```

**Refs, not state:** `wsRef` (WaveSurfer), `wsRegionsRef` (Regions plugin), `regionsRef`
(mirror of `regions` for use inside WaveSurfer callbacks), `zoomRef`, `zoomMinRef`.

**Why history uses `useReducer`:** WaveSurfer event handlers are registered once inside a
`useEffect`. A `useState` history pointer captured there goes stale, which caused undo/redo to read
`history[undefined]`. The reducer always sees current state. A restore flag suppresses the
`region-created` handler while `restoreSnapshot()` re-creates regions, so undo/redo doesn't push
new history entries.

---

## Analytics (PostHog)

- `lib/analytics.ts` — `initPostHog()` is a no-op unless `NEXT_PUBLIC_POSTHOG_KEY` is set.
  Host defaults to `https://us.i.posthog.com` (override with `NEXT_PUBLIC_POSTHOG_HOST`).
- All `track*()` helpers swallow errors, so calling them before init is safe.
- Events: `file_uploaded`, `region_created`, `preview_opened`, `export_completed`, `undo_used`,
  `redo_used`, `user_feedback`.
- **Feedback widget** sends its thumbs up/down, message and optional email as a `user_feedback`
  PostHog event. There is no other feedback backend — if PostHog is not configured, feedback goes
  nowhere.

Add new events as typed helpers in `lib/analytics.ts` rather than calling `posthog.capture` directly.

---

## SEO

Organic search is the main acquisition channel, so most recent work is here.

- `app/layout.tsx` — title, description, keyword list, Open Graph/Twitter cards, robots,
  Google Search Console verification (two tokens) and Bing (`msvalidate.01`)
- `app/page.tsx` — server-rendered landing page with keyword-targeted H1/H2s, screenshots,
  comparison table, FAQ, and two JSON-LD blocks (`WebApplication` + `FAQPage`)
- `lib/posts.ts` — blog posts. Each `Post` has `slug`, `title`, `description`, `date`, `keywords`
  and `content` (an HTML string). Adding a post to the array automatically adds its page
  (`generateStaticParams`), metadata and sitemap entry.
- `/editor` is `noindex` and disallowed in `robots.ts` — only the landing page and blog are indexed.
- The base URL `https://mp3-studio.vercel.app` is hard-coded in `sitemap.ts` and `robots.ts`;
  update both if a custom domain is added.

**Server components can't have event handlers.** `app/page.tsx` and the blog pages are server
components — adding `onClick`, `onMouseEnter`, etc. breaks the build. Use CSS `:hover` or move the
interactive piece into a small `"use client"` component.

---

## Client Component Rules

Only these files are `"use client"`: `AudioEditor.tsx`, `EditorLoader.tsx`, `FeedbackWidget.tsx`,
`PostHogProvider.tsx`. Keep everything else a server component so pages stay indexable and light.

The editor is loaded with `next/dynamic` and `ssr: false` (in `EditorLoader.tsx`) because
WaveSurfer and FFmpeg need browser APIs, and loading them eagerly froze the browser on first load.
`ssr: false` is only allowed inside a client component — that's why `EditorLoader` exists instead
of calling `dynamic()` from `app/editor/page.tsx` directly.

`lib/ffmpeg.ts` and `lib/posts.ts` have no React imports.

---

## Environment Variables

None are required. Optional:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` | Enables PostHog analytics and feedback collection |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog host (defaults to `https://us.i.posthog.com`) |

Set them in Vercel project settings. `.env*` files are gitignored.

---

## Local Development

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # run before pushing — Vercel fails the deploy on TypeScript errors
npm run lint
npm test           # Vitest unit tests (lib/*.test.ts)
npm run test:e2e   # Playwright smoke test (builds + starts the app itself)
npm run typecheck  # tsc for app code and for test files
```

The COOP/COEP headers from `next.config.ts` apply in development too.

### Tests

- **Unit (Vitest)** — `lib/posts.test.ts` (slugs unique and URL-safe, required fields, valid
  dates) and `lib/ffmpeg.test.ts` (`invertRegions`, mirroring the Python tests of the local app).
  Config: `vitest.config.ts`. Known bugs are written as `it.fails(...)`: when you fix one, Vitest
  reports that test as failing — change it to `it(...)`.
- **E2E smoke (Playwright)** — `e2e/editor-smoke.spec.ts`: opens `/editor`, uploads
  `e2e/fixtures/tone-5s.mp3`, drags a cut on the waveform, clicks Export and checks that an `.mp3`
  downloads. `playwright.config.ts` runs `npm run build && npm run start` itself (or reuses a server
  already on port 3000 outside CI — stop `npm run dev` first if you want to test a fresh build).
  It needs internet: the FFmpeg core comes from unpkg. First time: `npx playwright install chromium`.
- Test files are excluded from `tsconfig.json` so `next build` never type-checks them;
  `tsconfig.test.json` covers them instead (`npm run typecheck`).
- The waveform wrapper in `AudioEditor.tsx` carries `data-testid="waveform"` — keep it when
  refactoring, the smoke test drags on it.
- CI (`.github/workflows/ci.yml` at the repo root) runs lint, build, test type-check, Vitest and
  Playwright on every push and pull request.

---

## Deployment

Hosted on Vercel, which auto-detects Next.js. Pushing to the connected branch triggers a build.
Vercel's project root must point at the `mp3-studio-web/` folder, since the repo root holds the
Flask app.

---

## Key Design Decisions

**1. FFmpeg in the browser, not a server**
Zero hosting cost for audio processing and fully private. Trade-off: the first Preview/Export
waits for the ~30 MB core download; later ones reuse the loaded instance.

**2. No sign-up**
Removing friction gets real users fast. Add auth only when usage limits or paid tiers are needed.

**3. Server-rendered landing page and blog, client-only editor**
Google indexes the landing page and blog. The editor is an app shell and is not indexed.

**4. Cut regions = sections to DELETE**
Same convention as the local app. Red = cut. Inversion happens at export time in `invertRegions()`.

**5. No bundler customization**
Plain Next.js with no webpack config. The FFmpeg core loads from unpkg at runtime, not from the
app bundle.

---

## Things That Will Break If You're Not Careful

1. **Removing the COOP/COEP headers** without testing — see the section above.

2. **Using WaveSurfer or FFmpeg outside the client editor** — both touch `window`/DOM. They must
   stay inside `AudioEditor.tsx` (loaded with `ssr: false`) and be initialized in `useEffect` or
   event handlers.

3. **Guarding `loadFFmpeg()` yourself** — it's idempotent (`if (loaded) return`), so just call it
   before each FFmpeg run, as `runFFmpeg()` does.

4. **Forgetting `URL.revokeObjectURL()`** — every `createObjectURL()` must be revoked. See
   `handleFile()` (file + preview URLs) and `handleExport()` for the pattern.

5. **Adding event handlers to server components** (`app/page.tsx`, blog pages) — breaks the build.

6. **Reading `regions` state inside WaveSurfer callbacks** — use `regionsRef.current`; the state
   value captured when the callback was registered is stale.

7. **Pushing history without the restore guard** — re-creating regions during undo/redo fires
   `region-created`; the restore flag must stay set while `restoreSnapshot()` runs.

8. **Pushing without `npm run build`** — TypeScript errors that `next dev` tolerates fail the
   Vercel build.
