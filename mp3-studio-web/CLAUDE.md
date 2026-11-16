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
│       ├── AudioEditor.tsx   ← "use client" — thin entry: file + object URL, upload analytics,
│       │                        <ToastProvider>, <EditorShell>, DropZone or EditorSession
│       ├── EditorSession.tsx ← one loaded file (keyed by its object URL): wires hooks → UI
│       ├── hooks/
│       │   ├── useWaveSurfer.ts     ← create/destroy WaveSurfer + plugins, playback events,
│       │   │                           zoom calibration + slider, forwards region events
│       │   ├── useRegionHistory.ts  ← regions state/ref, undo/redo/reset/remove, restore guard
│       │   ├── usePlayback.ts       ← play/pause, skip, seek, speed, volume, mute
│       │   ├── useFFmpegJob.ts      ← preview/export runner, progress, failures → toast + analytics
│       │   ├── useRegionPlayback.ts ← ▶ play / ⟲ loop one region on the same WaveSurfer, `L`
│       │   ├── useKeyboardShortcuts.ts ← one window keydown listener → shortcutFor() → handler
│       │   └── useSessionAutosave.ts   ← restore/save this file's cuts in localStorage
│       ├── ui/
│       │   ├── EditorShell.tsx      ← background orbs, sticky top bar, content column
│       │   ├── DropZone.tsx         ← empty-state drag-and-drop / browse
│       │   ├── EditorToolbar.tsx    ← file name, "Save as", undo/redo/reset, change file
│       │   ├── WaveformCard.tsx     ← header, minimap, timeline, waveform + hover cursor, fullscreen
│       │   ├── ZoomBar.tsx          ← − / log slider / + / Fit / level badge
│       │   ├── PlaybackBar.tsx      ← transport, seek, volume, speed (+ children at the end)
│       │   ├── ActionButtons.tsx    ← Mark to Cut, Preview, Export (with progress fill)
│       │   ├── RegionList.tsx       ← cut list (card, or `compact` inside fullscreen): ▶/⟲ per row,
│       │   │                           click-to-type times, Delete on a focused row
│       │   ├── ShortcutsOverlay.tsx ← "Keyboard shortcuts" dialog (`?` or ⌨ button; portal to <body>)
│       │   └── PreviewModal.tsx     ← <audio> preview, rename, download (portal to <body>)
│       ├── toast/ToastProvider.tsx  ← <ToastProvider> + useToast() (in-house, no dependency),
│       │                               optional action button per toast
│       ├── history.ts        ← pure undo/redo reducer (+ history.test.ts)
│       ├── editorUtils.ts    ← pure helpers: fmt, zoom scale, file metadata, typed-time parse/
│       │                        format/validate (+ editorUtils.test.ts)
│       ├── shortcuts.ts      ← pure key → action mapping + overlay rows (+ shortcuts.test.ts)
│       ├── session.ts        ← pure localStorage session helpers (+ session.test.ts)
│       ├── theme.ts          ← `C` palette, button/badge/card style helpers, sliderBg, cutColor
│       └── types.ts          ← RegionData, Region, WsRegion
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
2. On the **first Preview or Export**, `loadFFmpeg()` loads the FFmpeg core
   (`@ffmpeg/core`, single-threaded UMD build, ~30 MB) **from the app's own origin** at
   `/ffmpeg/<version>/ffmpeg-core.{js,wasm}` (see "Self-hosted core" below)
3. `trimAndExport()` writes the file into FFmpeg's in-memory filesystem and runs **one**
   `ffmpeg.exec` built by the pure helper `buildExportArgs()`: the input is decoded once, each
   kept segment is cut with `atrim` + `asetpts`, a 12 ms `afade` out/in is applied at every
   **interior** join (never at the file's start or end), the segments are joined with the
   `concat` filter, and the result is encoded once with libmp3lame at 44.1 kHz:
   ```
   -i input.mp3 -filter_complex
     "[0:a:0]atrim=end=A,asetpts=PTS-STARTPTS,afade=t=out:…[s0];
      [0:a:0]atrim=start=B:end=C,asetpts=PTS-STARTPTS,afade=t=in:…,afade=t=out:…[s1];
      [0:a:0]atrim=start=D,asetpts=PTS-STARTPTS,afade=t=in:…[s2];
      [s0][s1][s2]concat=n=3:v=0:a=1[out]"
     -map [out] -c:a libmp3lame -q:a 2 -ar 44100 -y output.mp3
   ```
   With zero cuts there is no filter graph (`-map 0:a:0`); a single segment gets `atrim` but no
   fades. Segment edges at 0 / the end are left open so the output runs to the true end of the
   stream.
4. The result comes back as a `Blob`; the editor triggers a download via a temporary `<a download>`

**Self-hosted core (no CDN):**
- `@ffmpeg/core` is a dependency pinned to an **exact** version in `package.json` (no `^`/`~`;
  currently `0.12.6`). Keep it a 0.12.x version compatible with `@ffmpeg/ffmpeg`.
- `scripts/copy-ffmpeg-core.mjs` (plain Node, cross-platform) copies
  `node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.{js,wasm}` into `public/ffmpeg/<version>/`. It runs
  on `postinstall` (`npm install` / `npm ci`, incl. Vercel and CI) **and** on `prebuild` /
  `predev` (`npm run build` / `npm run dev`), so the files exist even when install scripts are
  skipped. It fails if the installed version differs from the `package.json` pin, and deletes
  folders of older versions.
- `public/ffmpeg/` is **gitignored** (the wasm is ~32 MB) and excluded from ESLint.
- `next.config.ts` reads the pin from `package.json` and exposes it as
  `NEXT_PUBLIC_FFMPEG_CORE_VERSION`; `loadFFmpeg()` builds the URL from it. It also sends
  `Cache-Control: public, max-age=31536000, immutable` for `/ffmpeg/*` — safe because the version is
  in the path, so upgrading `@ffmpeg/core` changes the URL.
- `loadFFmpeg()` passes **plain same-origin URLs**, not `toBlobURL` blobs (that was only needed for
  the cross-origin CDN). Verified in Chromium: the core loads and Preview/Export work. A real URL
  lets the browser stream-compile the wasm and reuse its HTTP cache entry without a 30 MB Blob copy.
- The FFmpeg worker loads the core with `importScripts()` (Turbopack bundles it as a classic
  worker), which is why the **UMD** build is used. If a bundler change ever makes it a module
  worker, `importScripts` fails and the library falls back to `import()`, which needs the ESM build.
- The Playwright smoke test asserts that every `ffmpeg-core.*` request goes to the app's own origin.
- **To upgrade:** `npm install --save-exact @ffmpeg/core@<version>`, then build and run the e2e test.

**Why one filter graph (don't go back to per-segment files):** the old pipeline cut each kept
segment with `-ss … -i` into `seg_N.mp3` and joined them with the concat demuxer + `-c copy`.
Measured with native FFmpeg: every non-first segment started with ~105–118 ms of silence
(MP3 input-seek), each segment also carried its encoder delay/padding, so a 30 s file with 3 cuts
came out 126 ms too long with ~155 ms dropouts at every join, plus hard-cut clicks. The rewritten
Xing header was fine (reported duration = decoded length). The filter graph is sample-accurate
and encodes once.

**Encoder options:** `trimAndExport(file, cuts, duration, onProgress, options?)` where
`options = { quality?: "standard" | "high", bitrateKbps?: number }`. Default `"standard"` = VBR
`-q:a 2` (~190 kbps); `"high"` = VBR `-q:a 0` (~245 kbps); `bitrateKbps` = CBR `-b:a` (clamped
32–320) and overrides `quality`. No UI uses this yet.

**Progress reporting:** `trimAndExport` reports 0–5% while writing the input, then 5–99% from the
`time=` field of FFmpeg's stats log divided by the expected *output* length (the library's own
`progress` event divides by the input length, which is wrong once parts are cut), then 100%.
In `AudioEditor.runFFmpeg()`, loading maps to 0–20% (`loadFFmpeg` reports only 0 and 100) and
trimming to 20–100%.

**Errors:** `loadFFmpeg()` wraps failures in `FFmpegLoadError`. `trimAndExport` throws if
`exec` returns a non-zero exit code (with the last error lines from the log), and after **any**
failure it terminates the instance so the next attempt reloads a fresh one (a wasm OOM can leave
the heap unusable). `isLikelyOutOfMemory(e)` classifies `RangeError` / "memory access out of
bounds" / allocation failures; the editor uses it to show a "try a shorter or compressed file"
message.

**Limits to keep in mind:** the source file, its decoded frames in flight, and the output MP3
all live in WebAssembly memory, so very large/long uncompressed files (WAV, FLAC) are where this
will fail first. Failures are tracked as `export_failed` (see Analytics).

### The COOP/COEP headers

`next.config.ts` sets these on every response:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

They were added because multi-threaded FFmpeg.wasm needs `SharedArrayBuffer`. The app loads the
**single-threaded** core, which does not use `SharedArrayBuffer`.

**Tested 2026-11-15 (Chromium, production build, headers removed from `next.config.ts`, core
self-hosted):** the page was *not* cross-origin isolated (`crossOriginIsolated === false`,
`typeof SharedArrayBuffer === "undefined"`), and FFmpeg still worked:
- built-in browser: 5 s tone with a 1.6 s cut → Preview produced a 3.37 s MP3, no errors;
- Playwright smoke test (fresh profile, so the core was fetched over the network): upload → cut →
  Export downloaded a valid MP3.

So on Chromium the headers are **not needed** for the single-threaded core. Not yet tested:
Firefox and Safari, and the deployed Vercel site. They are still set; whether to drop them is an
open decision. Removing them would allow third-party embeds; keeping them is required only if the
multi-threaded core (`@ffmpeg/core-mt`) is ever adopted. **Do not remove them without testing
Preview and Export in Firefox and Safari as well.** While they are set, `require-corp` blocks
third-party resources (images, iframes, scripts) that don't send CORS/CORP headers — keep that in
mind when embedding anything. Same-origin files (like the self-hosted core) are unaffected.

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
- **Mark to Cut** button or `N` — drops a 10 s region centered on the playhead

All region creation goes through WaveSurfer's `region-created` event, which updates React state
and pushes history. Regions can be dragged/resized (`region-updated`), get typed-in start/end
times (`updateRegionTimes` — `setOptions()` doesn't emit `region-updated`, so it commits itself)
and be removed from the list.

---

## Editor Features (components/editor/)

- Drag-and-drop or browse upload
- Waveform (360 px tall, purple→blue gradient), top timeline ruler, overview minimap
- Hover cursor with time readout
- Logarithmic zoom slider, calibrated per file (see below), up to 2000 px/sec
- Play/pause, ±5 s skip, seek bar, volume + mute, playback speed
- Undo / redo / reset of region changes
- Preview modal (HTML5 `<audio>` of the merged result) with download
- Output filename input (used as the download name)
- Fullscreen waveform (`F` toggles, Esc exits)
- Keyboard shortcuts (see the table below) + a "Keyboard shortcuts" overlay (`?` or the ⌨ button
  in the waveform header)
- Typed-in region times: click a start/end time in the cut list → text input accepting
  `SS.mmm`, `M:SS.mmm` or `H:MM:SS.mmm` (`parseTime()`); Enter or blur applies, Esc cancels.
  `resolveTimeEdit()` clamps to [0, duration] and requires start < end (≥ 10 ms); an invalid
  value keeps the field open with a red border on Enter and is dropped on blur. One edit = one
  history entry.
- Play / loop one cut: ▶ per row plays just that region (pauses at its end, playhead left there),
  ⟲ loops it until clicked again or `L`. See "Region play / loop" below.
- Session auto-save of the cuts per file (see "Auto-save" below)
- Toast notifications (`toast/ToastProvider.tsx`): success after Export and after "Download MP3"
  in the preview, errors when Preview/Export fail (out-of-memory gets the "try a shorter or
  compressed file" wording), info when a session is restored. Auto-dismiss (5 s, errors 10 s),
  pause on hover/focus, close button, optional `action` button (`{ label, onClick }` in the
  options; clicking runs it and dismisses); errors are `role="alert"`, others `role="status"`
  inside an `aria-live="polite"` viewport.
  **Never use `alert()`** in the editor — call `useToast()` instead.

**Not implemented here (exists only in the local app):** light theme, YouTube download, the
right-click region context menu.

**Where new editor features go:** new shortcuts → a new `ShortcutAction` + key in
`shortcuts.ts` (`shortcutFor` + `SHORTCUT_LIST`, with a test) and a `case` in `onShortcut` in
`EditorSession.tsx`, calling the same callback the button uses; new FFmpeg actions (remove
silence, normalize, split export, formats) → extend `useFFmpegJob` and reuse its `run()` /
`reportFailure()`; new buttons → `ui/ActionButtons.tsx` (rendered as `PlaybackBar` children);
per-region actions → a button in the `RegionList` row next to ▶/⟲.

### Keyboard Shortcuts

Mapping in `shortcuts.ts` (pure, unit-tested), listener in `hooks/useKeyboardShortcuts.ts`,
actions in `onShortcut` in `EditorSession.tsx`. Same keys as the local app.

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `N` | Drop a 10 s cut centered on the playhead (same as Mark to Cut) |
| `P` | Preview |
| `F` | Toggle fullscreen waveform |
| `L` | Stop a looping region |
| `←` / `→` | Skip 5 s |
| `Ctrl/⌘+Z` | Undo |
| `Ctrl/⌘+Y`, `Ctrl/⌘+Shift+Z` | Redo |
| `Delete` / `Backspace` | Remove the focused row in the cut list (handled by the row) |
| `?` | Open / close the shortcuts overlay |
| `Esc` | Close the overlay → else the preview modal → else exit fullscreen |

Rules (keep them when adding keys): nothing fires while focus is in a text input, textarea,
select or contenteditable (except Esc; a field that handles Esc itself calls `preventDefault` /
`stopPropagation`, like the region time editor); arrows are left to a focused range slider;
letters and arrows never fire with Ctrl/⌘/Alt, so browser shortcuts (Ctrl+P, Ctrl+F, Alt+←, …)
are untouched; one-shot keys ignore key repeat. `preventDefault` is called only for keys that
were used, so Space doesn't scroll the page or "click" the focused button. While the overlay is
open only `?`/Esc work; while the preview modal is open only Esc does (Space etc. go to its
`<audio>` controls). Before the audio has decoded, shortcuts other than `?`/Esc do nothing.

### Region play / loop
`useRegionPlayback` uses the editor's WaveSurfer instance (no second `<audio>`, unlike the local
app's mini-player): `setTime(start)` + `play()`, and one `timeupdate` listener that reads the
region's **live** bounds from `regionsRef` (`region.wsRef.start/end`), so dragging or typing new
times while it plays takes effect immediately. At the end it pauses (▶) or jumps back to the start
(⟲; a region that ends at the end of the file restarts from the `pause`/`finish` event). The mode
ends when playback pauses for any reason, when the user seeks outside the region (a jump > 0.75 s
to outside it; playback continues from there), when the region disappears (removed/undone →
pause), or when a new file loads (the session remounts). Only one region plays at a time;
clicking ▶ on a looping region switches it to a single play, ⟲ on a playing one starts looping.

### Auto-save
`useSessionAutosave` + `session.ts`. Cuts are stored in `localStorage` under
`mp3studio-web:session:<FNV-1a hash of name|size|lastModified>` as
`{ v: 1, cuts: [{ start, end }], savedAt }` on every region change; no cuts → the entry is
removed. Only the 20 most recently saved files are kept (`MAX_SESSIONS`; on a quota error it
prunes to 10 and retries once). Every storage call is in try/catch (private mode, blocked
storage, quota) — failures just mean nothing is remembered.
Restore runs once after `duration > 0`: cuts are clamped to the duration, re-created with
`loadRegions()` — which makes them the history **baseline** (`{ type: "load" }`, no entry, Undo
stays disabled) — and an info toast "Restored N cuts from your last session" offers **Clear**
(an undoable reset, so Ctrl+Z brings them back). Saving is enabled only after that check, so a
freshly mounted (empty) session never overwrites stored cuts. Nothing leaves the browser.

### Zoom calibration
Same idea as the local app: after `ready`, `useWaveSurfer` measures
`container.offsetWidth / duration` (the natural fit-to-view px/sec) and stores `zoomMin` **state**
just above it (`calibrateZoomMin()` in `editorUtils.ts`). `sliderToZoom(s, zoomMin)` maps slider
0–100 onto a log curve from `zoomMin` to `ZOOM_MAX` (2000), so position 0 always produces a visible
zoom. One effect applies `ws.zoom()` whenever the slider, `zoomMin` or `duration` changes. `zoomMin`
is state (not a ref) because the zoom badge renders it — reading a ref during render is a
`react-hooks/refs` lint error.

### Styling
The editor uses **inline styles** driven by the `C` color object and the style helpers
(`ghostBtn`, `primaryBtn`, `iconBtn`, `badge`, `card`, `textInput`, `sectionLabel`, `sliderBg`) in
`components/editor/theme.ts` (same palette as the local app: `#06060f` background, `#7c3aed`
purple, `#06b6d4` cyan). Use them in new editor components instead of new hex values. The landing
page and blog use Tailwind + `globals.css`.

---

## State Architecture

There is no global state manager. State is split by lifetime:

```
AudioEditor                 source { file, url }  → the File and its object URL
EditorSession (key = url)   outputName, zoomSlider, fullscreen, showShortcuts
  useRegionHistory          regions[] { id, start, end, wsRef } — source of truth for export
                            hist (useReducer, history.ts) → { history: RegionData[][], ptr }
  useWaveSurfer             duration, currentTime, isPlaying, zoomMin
  usePlayback               speed, volume, muted
  useRegionPlayback         active { id, loop } | null (+ activeRef for the timeupdate listener)
  useSessionAutosave        (no state — a ref that gates saving until the restore check ran)
  useFFmpegJob              exporting / exportProgress / exportDone,
                            previewing / previewProgress / previewUrl / showPreview
WaveformCard                cursorTime (hover readout)
DropZone                    dragging (highlight)
ToastProvider               toasts[]
```

**New file = new session.** `AudioEditor` renders `<EditorSession key={url}>`, so choosing another
file unmounts the old session (WaveSurfer destroyed, preview URL revoked) and mounts a fresh one —
there is no manual "reset everything" list to keep in sync. Put new per-file state in
`EditorSession` or its hooks, not in `AudioEditor`.

**Refs, not state:** `wsRef` (WaveSurfer, from `useWaveSurfer`), `pluginRef` (Regions plugin,
created in `EditorSession` and shared by `useWaveSurfer` + `useRegionHistory`), `regionsRef`
(mirror of `regions` for code that runs inside WaveSurfer callbacks), the container refs
(`waveRef`, `minimapRef`, `timelineRef`) and the hover cursor/badge refs in `WaveformCard`.
Never read `.current` during render (lint error `react-hooks/refs`); if the UI needs a value, keep
it in state.

**WaveSurfer callbacks:** `useWaveSurfer` registers its listeners once per file inside an effect
and forwards region events through React's `useEffectEvent`, so they always call the latest
`onRegionCreated/Updated/DoubleClicked` from `useRegionHistory`.

**Why history uses `useReducer`:** WaveSurfer event handlers are registered once inside a
`useEffect`. A `useState` history pointer captured there goes stale, which caused undo/redo to read
`history[undefined]`. The reducer always sees current state. A restore flag suppresses the
`region-created` handler while `restoreSnapshot()` re-creates regions, so undo/redo doesn't push
new history entries. `restoreSnapshot()` passes each snapshot's `id` to `addRegion()`, so a
re-created region keeps its id — before wave 3 it got a new random one, and dragging or
double-clicking a region after an undo no longer matched its entry in `regions`.

---

## Analytics (PostHog)

- `lib/analytics.ts` — `initPostHog()` is a no-op unless `NEXT_PUBLIC_POSTHOG_KEY` is set.
  Host defaults to `https://us.i.posthog.com` (override with `NEXT_PUBLIC_POSTHOG_HOST`).
- All `track*()` helpers swallow errors, so calling them before init is safe.
- Events: `file_uploaded`, `region_created`, `preview_opened`, `export_completed`,
  `export_failed`, `undo_used`, `redo_used`, `user_feedback`.
- `export_failed` (`trackExportFailed`) fires from the catch blocks of `handleExport` /
  `handlePreview` in `components/editor/hooks/useFFmpegJob.ts` (via `reportFailure`) with `{ stage: "load" | "export" | "preview", format,
  sizeMB, durationSec, cutCount, message }`. `stage` is `"load"` when the error is an
  `FFmpegLoadError`; `message` is truncated to 200 chars. Use it to see how often large files
  exhaust WebAssembly memory (filter on `format` / `sizeMB` / message text).
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

The other files under `components/editor/` (hooks, `ui/`, `toast/`, `EditorSession.tsx`) use hooks
and browser APIs but carry **no** `"use client"` directive: they are only ever imported from
`AudioEditor.tsx`, which is the client boundary (and is itself only loaded client-side through
`EditorLoader`). Don't import them from a server component; add the directive if one ever needs to
be used elsewhere.

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
npm test           # Vitest unit tests (lib/ and components/**/*.test.ts)
npm run test:e2e   # Playwright smoke test (builds + starts the app itself)
npm run typecheck  # tsc for app code and for test files
```

The COOP/COEP headers from `next.config.ts` apply in development too.

### Tests

- **Unit (Vitest)** — `lib/posts.test.ts` (slugs unique and URL-safe, required fields, valid
  dates), `lib/ffmpeg.test.ts` (`invertRegions`, mirroring the Python tests of the local app),
  `components/editor/history.test.ts` (undo/redo reducer: push drops the redo branch, undo/redo
  at the ends are no-ops, reset, clear, load, immutability), `components/editor/editorUtils.test.ts`
  (time format, zoom scale, file metadata, typed-time parse/format/validate),
  `components/editor/shortcuts.test.ts` (key mapping, text-field/slider/modifier rules) and
  `components/editor/session.test.ts` (key, save/load, clamping, pruning to 20, quota, throwing
  storage — with an in-memory fake). Vitest runs in Node, so keep `history.ts`, `editorUtils.ts`,
  `shortcuts.ts` and `session.ts` free of React and DOM globals. Config: `vitest.config.ts`. Known bugs are written as `it.fails(...)`: when you fix one, Vitest
  reports that test as failing — change it to `it(...)`.
- **E2E smoke (Playwright)** — `e2e/editor-smoke.spec.ts`: opens `/editor`, uploads
  `e2e/fixtures/tone-5s.mp3`, drags a cut on the waveform, clicks Export and checks that an `.mp3`
  downloads. `playwright.config.ts` runs `npm run build && npm run start` itself (or reuses a server
  already on port 3000 outside CI — stop `npm run dev` first if you want to test a fresh build).
  It needs internet: the FFmpeg core comes from unpkg. First time: `npx playwright install chromium`.
- **E2E features (Playwright)** — `e2e/editor-features.spec.ts`: `N` creates a cut, Ctrl+Z / Ctrl+Y,
  shortcuts ignored in text fields, typed-in times (valid, invalid, Esc, one undo step each),
  Delete on a focused row, ▶ stops at the region end and ⟲ loops until `L`, `?`/Esc/`F` and the
  overlay button, and reload + same file restores the cuts (toast, Clear, Ctrl+Z). No FFmpeg
  needed, so it runs in seconds. To run against another port than 3000:
  `E2E_PORT=3211 npx playwright test`.
- Test files are excluded from `tsconfig.json` so `next build` never type-checks them;
  `tsconfig.test.json` covers them instead (`npm run typecheck`).
- The waveform wrapper in `ui/WaveformCard.tsx` carries `data-testid="waveform"` — keep it when
  refactoring, the smoke test drags on it. Other editor test ids: `drop-zone`, `editor-toolbar`,
  `waveform-card`, `playback-bar`, `region-list`, `region-list-compact`, `preview-modal`,
  `shortcuts-overlay`, `toast-viewport`, `toast-success` / `toast-error` / `toast-info`. Region rows
  carry a `data-region-row` attribute.
- The cut list renders start and end as two buttons inside one `<span>` whose text is exactly
  `m:ss.d → m:ss.d` — the smoke test matches that span with an anchored regex, so don't add other
  text inside it.
- WaveSurfer's drag helper swallows any click within 10 ms after a drag ends. Automated tests that
  click a button immediately after dragging on the waveform must wait a moment first.
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
Plain Next.js with no webpack config. The FFmpeg core is not bundled: `scripts/copy-ffmpeg-core.mjs`
copies it from `node_modules` into `public/ffmpeg/<version>/` (postinstall, prebuild, predev) and it is
loaded at runtime from the app's own origin. No third-party CDN is involved, so a CDN outage can't
break export, and the version lives in `package.json` instead of a string.

---

## Things That Will Break If You're Not Careful

1. **Removing the COOP/COEP headers** without testing — see the section above.

2. **Using WaveSurfer or FFmpeg outside the client editor** — both touch `window`/DOM. They must
   stay inside `components/editor/` (reached only through `AudioEditor.tsx`, loaded with
   `ssr: false`) and be initialized in `useEffect` or event handlers.

3. **Guarding `loadFFmpeg()` yourself** — it's idempotent (`if (loaded) return`), so just call it
   before each FFmpeg run, as `run()` in `hooks/useFFmpegJob.ts` does.

4. **Forgetting `URL.revokeObjectURL()`** — every `createObjectURL()` must be revoked. See
   `handleFile()` in `AudioEditor.tsx` (file URL), `useFFmpegJob` (preview URL on replace and on
   unmount; export URL right after the download starts).

5. **Adding event handlers to server components** (`app/page.tsx`, blog pages) — breaks the build.

6. **Reading `regions` state inside WaveSurfer callbacks** — use `regionsRef.current` (in
   `useRegionHistory`); the state value captured when the callback was registered is stale.

7. **Pushing history without the restore guard** — re-creating regions during undo/redo fires
   `region-created`; `isRestoringRef` must stay set while `restoreSnapshot()` runs, and every
   region handler must check it. Change regions only through `commit()` in `useRegionHistory`
   (never inside a `setRegions` updater — StrictMode runs updaters twice → double history entries).

8. **Pushing without `npm run build`** — TypeScript errors that `next dev` tolerates fail the
   Vercel build.

9. **Reading a ref's `.current` during render** — `react-hooks/refs` is an error (the old
   per-file override is gone). Keep render-visible values in state (see `zoomMin`).

10. **Putting per-file state in `AudioEditor`** — it outlives a file change. Per-file state belongs
    in `EditorSession` or its hooks, which remount for every new file.

11. **Using `alert()`** — use `useToast()` from `toast/ToastProvider.tsx`.

12. **Adding a second keydown listener** for editor shortcuts — add the key to `shortcuts.ts` and
    handle it in `onShortcut` instead, so the text-field/modifier rules and the Esc order stay in
    one place. Hooks that subscribe to WaveSurfer (`useRegionPlayback`) must be called **after**
    `useWaveSurfer` so the instance exists when their effect runs.

13. **Saving the session before the restore check** — `useSessionAutosave` gates saving on a ref
    set by the restore effect; saving the initial empty region list would delete the stored cuts.
