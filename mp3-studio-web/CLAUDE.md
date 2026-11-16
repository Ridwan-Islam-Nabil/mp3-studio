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
│       │   └── useFFmpegJob.ts      ← preview/export runner, progress, failures → toast + analytics
│       ├── ui/
│       │   ├── EditorShell.tsx      ← background orbs, sticky top bar, content column
│       │   ├── DropZone.tsx         ← empty-state drag-and-drop / browse
│       │   ├── EditorToolbar.tsx    ← file name, "Save as", undo/redo/reset, change file
│       │   ├── WaveformCard.tsx     ← header, minimap, timeline, waveform + hover cursor, fullscreen
│       │   ├── ZoomBar.tsx          ← − / log slider / + / Fit / level badge
│       │   ├── PlaybackBar.tsx      ← transport, seek, volume, speed (+ children at the end)
│       │   ├── ActionButtons.tsx    ← Mark to Cut, Preview, Export (with progress fill)
│       │   ├── RegionList.tsx       ← cut list (card, or `compact` inside fullscreen)
│       │   └── PreviewModal.tsx     ← <audio> preview, rename, download (portal to <body>)
│       ├── toast/ToastProvider.tsx  ← <ToastProvider> + useToast() (in-house, no dependency)
│       ├── history.ts        ← pure undo/redo reducer (+ history.test.ts)
│       ├── editorUtils.ts    ← pure helpers: fmt, zoom scale, file metadata (+ editorUtils.test.ts)
│       ├── theme.ts          ← `C` palette, button/badge/card style helpers, sliderBg, cutColor
│       └── types.ts          ← RegionData, Region, WsRegion
├── lib/
│   ├── ffmpeg.ts             ← Audio engine entry point: FFmpeg.wasm runtime (loadFFmpeg, exportAudio,
│   │                            trimAndExport, exportSegments, detectSilence) + re-exports of lib/audio/
│   │                            (+ ffmpeg.test.ts: public API surface)
│   ├── audio/                ← pure builders, no FFmpeg instance, no DOM (each has a *.test.ts)
│   │   ├── regions.ts        ← CutRegion/KeepSegment, invertRegions, keepToCuts, mergeRegions
│   │   ├── formats.ts        ← OutputFormat, OUTPUT_FORMATS (ext/MIME/codec/muxer), encoderArgs,
│   │   │                        IPHONE_RINGTONE_MAX_SEC
│   │   ├── args.ts           ← ExportOptions, buildExportArgs, buildSegmentExportArgs,
│   │   │                        buildSilenceDetectArgs, normalize (measure pass, gain + limiter,
│   │   │                        loudnorm) and fade filters
│   │   ├── silence.ts        ← parseSilenceLog, silencesToCuts, DEFAULT_SILENCE_OPTIONS
│   │   ├── loudness.ts       ← parseEbur128Summary, parseR128Metadata, normalizeGainDb
│   │   └── log.ts            ← parseLogTime, parseInputDuration, errorLines
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
     -map [out] -c:a libmp3lame -q:a 2 -ar 44100 -f mp3 -y output.mp3
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

**Encoder options, formats, normalize, fades, split export, silence detection:** see
"Audio Engine API" below.

**Progress reporting:** every job reports 0–5% while writing the input, then 5–99% from the
`time=` field of FFmpeg's stats log divided by the expected *output* length (the library's own
`progress` event divides by the input length, which is wrong once parts are cut), then 100%.
Progress never goes backwards. In `useFFmpegJob`, loading maps to 0–20% (`loadFFmpeg` reports
only 0 and 100) and trimming to 20–100%.

**Errors:** `loadFFmpeg()` wraps failures in `FFmpegLoadError`. Every job throws if
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

## Audio Engine API (lib/ffmpeg.ts + lib/audio/)

The processing layer for the editor and for the wave-4 feature pages (remove silence, normalize,
split export, ringtone maker, format choice, keep mode). **No UI uses the new functions yet.**
Import everything from `@/lib/ffmpeg`; it re-exports the pure modules in `lib/audio/`.

**Layering:** `lib/audio/*` are pure (no FFmpeg instance, no DOM, no React) and unit-tested in
Node. They decide *what* FFmpeg runs. `lib/ffmpeg.ts` owns the single FFmpeg instance and runs
jobs. Jobs are queued (never interleave on the shared instance), each writes the input into the
virtual FS once, runs **one** `exec` (two with fast `normalize`: measure, then export), reads the
outputs back and deletes every file. Call
`loadFFmpeg()` first (idempotent); after any failed job the instance is terminated and the next
`loadFFmpeg()` reloads it.

### Jobs (need `loadFFmpeg()`)

| Function | Returns | Notes |
|---|---|---|
| `exportAudio(file, cuts, duration, options?)` | `ExportResult { blob, format, mimeType, extension, durationSec, loudness? }` | One output file. `options` = `ExportOptions` + `onProgress`. `loudness` = `{ measuredLufs, gainDb }`, only with fast normalize |
| `trimAndExport(file, cuts, duration, onProgress?, options?)` | `Blob` | Original API (the editor uses it); wraps `exportAudio`. `blob.type` is the format's MIME type |
| `exportSegments(file, cuts, duration, options?)` | `SegmentResult[]` (`ExportResult` + `fileName`, `index`, `start`, `end`) | One file per kept segment, named `<baseName>-01.<ext>`, `-02`, … (3 digits from 100 segments). `options.baseName` defaults to the source name without extension. Zipping is the caller's job |
| `detectSilence(file, options?)` | `CutRegion[]` | `{ thresholdDb = -40, minSilenceSec = 0.7, paddingSec = 0.15, duration?, onProgress? }`. Cuts are padded, merged, clamped; ready to merge with user cuts or to show for review |
| `loadFFmpeg(onProgress?)`, `isFFmpegLoaded()`, `isLikelyOutOfMemory(e)`, `FFmpegLoadError`, `getAudioDuration(file)` | | unchanged |

`cuts` are always regions to **delete**; with `[]` the whole file is exported. Everything cut →
throws `"Nothing to export — every part of the audio is cut."` (before running FFmpeg, so the
instance is kept).

### `ExportOptions`

| Option | Default | Effect |
|---|---|---|
| `format` | `"mp3"` | `"mp3"` libmp3lame · `"wav"` pcm_s16le · `"m4a"` AAC in the `ipod` (MPEG-4) muxer · `"m4r"` same bytes as m4a, `.m4r` extension (iPhone ringtone). MIME: `audio/mpeg`, `audio/wav`, `audio/mp4`, `audio/mp4`. All outputs are 44.1 kHz; channels are kept. m4a/m4r get `-movflags +faststart` |
| `quality` | `"standard"` | MP3: VBR `-q:a 2` (~190 kbps) / `"high"` `-q:a 0` (~245 kbps). AAC: 192 / 256 kbps CBR. WAV: ignored |
| `bitrateKbps` | — | CBR, clamped 32–320, overrides `quality`. WAV: ignored |
| `normalize` | `false` | Target `LOUDNORM_TARGET` (-16 LUFS, -1.5 dBTP). `true` / `"fast"`: two passes — measure the kept audio with `ebur128`, then `volume=<-16 − measured>dB` + 2× oversampled `alimiter` (ceiling -2 dBFS) after the concat. `"loudnorm"`: the old single-pass `loudnorm=I=-16:TP=-1.5:LRA=11`, ~2.5× slower. See "Normalize" below |
| `fade` | — | `{ inSec?, outSec? }` fade-in/out at the very start/end of the output file (after normalize). Scaled down proportionally if longer than the output. Positions use the expected output length (sum of kept segments) |

`exportSegments` applies `normalize` and `fade` to **each file** separately (fast mode: one measure
run with a meter per segment, so each file gets its own gain; `SegmentResult.loudness` per file),
and adds a 12 ms de-click fade at every segment edge that was a cut point (not at the source's own
start/end).

### Pure helpers

- **Regions** (`audio/regions.ts`): `invertRegions(cuts, duration)` (cut → keep);
  `keepToCuts(keepRegions, duration)` (**keep mode**: the user marks what to keep, convert once and
  use the normal export path; `invertRegions(keepToCuts(k, d), d)` returns `k` sorted and merged;
  no keep regions → the whole file is cut); `mergeRegions`, `totalLength`, `MIN_SEGMENT_SEC`
  (0.01 s: shorter gaps are dropped).
- **Formats** (`audio/formats.ts`): `OUTPUT_FORMATS`, `formatInfo(format)`,
  `withExtension(name, format)`, `encoderArgs(format, options)`, `IPHONE_RINGTONE_MAX_SEC` (40 —
  iOS ignores longer ringtones; Android has no fixed limit; the engine does not enforce it),
  `AAC_BITRATE_KBPS`, `OUTPUT_SAMPLE_RATE`.
- **Args** (`audio/args.ts`): `buildExportArgs(input, keep, duration, output, options, gainDb?)`,
  `buildSegmentExportArgs(input, keep, duration, outputNames, options, gainsDb?)` (the gain
  arguments are required in fast-normalize mode and throw without them),
  `buildLoudnessMeasureArgs(input, keep, duration)` (fast normalize pass 1: the export's
  atrim/fade/concat graph into `ebur128=framelog=verbose`, `-f null -`, no output fades),
  `buildSegmentLoudnessMeasureArgs(input, keep, duration, metadataNames)` (one meter per segment,
  each writing `ametadata=mode=print:key=lavfi.r128.I:file=<name>`),
  `buildSilenceDetectArgs(input, { thresholdDb, minSilenceSec })`, `outputFilters(sec, options,
  gainDb?)`, `normalizeMode(normalize)` (`true` → `"fast"`), `linearGainFilters(gainDb)`,
  `segmentFilters`, `loudnormFilter`, `segmentNumber`, `JOIN_FADE_SEC`, `EDGE_EPSILON_SEC`,
  `LOUDNORM_TARGET`, `LIMITER_CEILING_DB` (-2), `LIMITER_OVERSAMPLE_RATE` (88200).
- **Loudness** (`audio/loudness.ts`): `parseEbur128Summary(log)` (integrated LUFS from the last
  `Summary:` block; string or lines; works with and without the `[Parsed_ebur128_0 @ …]` prefix,
  which the wasm core drops at some log levels; per-frame `I:` values are ignored; `-inf` →
  -Infinity), `parseR128Metadata(text)` (last `lavfi.r128.I=` value of an ametadata file),
  `normalizeGainDb(measured, target)` (target − measured, rounded to 0.01 dB; **0 for silence**:
  ≤ `SILENCE_LUFS` (-70), -inf or NaN).
- **Silence** (`audio/silence.ts`): `parseSilenceLog(log, duration?)` (string or lines; handles
  the wasm log format, where the `[silencedetect @ …]` prefix arrives as a separate event and the
  final `silence_end` comes after the statistics; a trailing unterminated silence closes at
  `duration`), `silencesToCuts(silences, duration, paddingSec)` (padding next to the remaining
  audio, none at the file edges; a silence within 50 ms of the start/end counts as touching it;
  cuts < 50 ms dropped). `detectSilence` takes the duration from `options.duration`, else from the
  last stats `time=` (the decoded length; the MP3 header's `Duration:` is only an estimate —
  180.04 s for a 180.00 s file — which left a 0.15 s sliver at the end).
- **Log** (`audio/log.ts`): `parseLogTime`, `parseInputDuration`, `errorLines`.

### Design choices

- **Split export = one FFmpeg run with one output per segment.** The input is decoded once and
  every `[0:a:0]atrim…[oN]` chain feeds its own encoder. One run per segment is slower because
  `atrim` doesn't seek: run N decodes the source from 0 up to segment N. (Input seeking with `-ss`
  is not an option — see "Why one filter graph" above.) The first output is
  `-map 0:a:0 -c copy -f null -`: it costs ~nothing and makes the stats `time=` follow the input
  position, which is what progress needs (the segment outputs' times jump around).
- **Formats:** encoder availability was checked on the bundled core (`@ffmpeg/core` 0.12.6 =
  FFmpeg 5.1.4) with `-encoders` / `-muxers` / `-filters`. Present: encoders `libmp3lame`,
  `aac`, `pcm_s16le`, `alac`, `flac`, `libopus`, `libvorbis`; muxers `mp3`, `wav`, `ipod`,
  `mp4`, `ogg`, `flac`; filters `loudnorm`, `silencedetect`, `afade`, `atrim`, `asetpts`,
  `concat`, `aresample`. So FLAC/Opus/OGG/ALAC outputs could be added to `OUTPUT_FORMATS` without a
  new core.
- **Normalize defaults to two-pass linear ("fast").** Single-pass `loudnorm` (dynamic mode)
  upsamples to 192 kHz internally for true-peak detection, which is what makes it slow. Fast mode
  instead measures once and applies one constant gain, so the dynamics are kept (loudnorm also
  rides the gain and squeezes the loudness range). Details that matter:
  - The measure pass uses the **same** atrim/de-click/concat graph as the export, so it measures
    exactly what gets encoded (before the output `fade`, like loudnorm). `ebur128` without
    `peak=true` (true-peak metering would upsample too); `framelog=verbose` keeps the 10
    lines/second of frame logging out of the log at info level.
  - **Split export can't use the log**: with several meters the summaries are printed in
    filter-graph teardown order (not segment order) and the wasm core sometimes drops the
    `[Parsed_ebur128_N @ …]` prefix. Each meter therefore writes its own small text file via
    `ametadata … file=loudness-NN.txt`, read back as a pass-1 output. The last reading matched
    the summary within 0.05 LU.
  - **Limiter:** `alimiter=limit=0.794328:level=disabled:latency=1` at 88.2 kHz. `level` is
    alimiter's auto-level, **on by default** in FFmpeg 5.1 — it would scale the output back up
    to 0 dBFS. `latency=1` compensates the 5 ms look-ahead (output length unchanged, checked).
    Ceiling -2 dBFS = 0.5 dB under the -1.5 dBTP target for the overshoot of downsampling and
    the lossy encoder. Measured on MP3 output (native FFmpeg 8, same filters): with 6 dB of gain
    reduction, no oversampling reached -0.4 dBTP, 2× -1.0 dBTP, 4× -1.0 dBTP; in the browser 2×
    costs +0.5 s and 4× +1.3 s for 3 minutes, hence 2×. Mild limiting lands around -1.6 to -2 dBTP.
  - Silence (≤ -70 LUFS) gets gain 0 instead of +54 dB. There is no other gain cap: very quiet
    material is boosted all the way to -16 LUFS and the limiter takes the peaks.
  - Progress: the measure pass is weighted 1, the export pass 4 (0.45 s vs ~2 s).

### Measured performance

Headless Chromium (Playwright), `next dev`, single-threaded core, 180 s stereo MP3 (97 kbps,
44.1 kHz) with silent stretches at 30–33 s, 90–91.5 s, 150–150.4 s and 177–180 s. Outputs checked
with native `ffprobe` / `ebur128`.

| Job | Time | Output check |
|---|---|---|
| `loadFFmpeg()` (core in HTTP cache of the dev server) | 1.3 s | |
| MP3, 2 cuts → 160 s | 1.9–2.2 s | 160.000 s |
| same + `normalize: "loudnorm"` | **13.3 s** (~6.5× slower) | -29.2 → **-16.2 LUFS**, true peak -8.6 dBFS |
| MP3 whole file 180 s / + `"loudnorm"` | 2.3 s / 15.0 s | |
| WAV 30 s clip | 0.18 s | pcm_s16le, 30.000 s |
| M4A 30 s clip / 160 s | 0.87 s / 4.0 s (AAC ≈ 2× LAME) | aac 192 kbps, brand `M4A `, 30.000 s |
| M4R ringtone 35 s, `"loudnorm"` + `fade {in 1, out 2}` | 2.7 s | 35.000 s, -16.3 LUFS, quiet first/last 0.4 s |
| `detectSilence()` 180 s | 0.3–0.5 s | finds 30.02–33.02, 90.02–91.51, 177.0–180 (150.0–150.4 is below `minSilenceSec`) |
| export with the silence cuts | | 173.42 s |
| `exportSegments` 3 segments: one run vs one run per segment | 1.5–2.3 s vs 3.0 s | 30.172 / 57.303 / 85.796 s |
| `exportSegments` 10 segments: one run vs one run per segment | 3.2 s vs 4.7 s | |
| keep mode `keepToCuts([5–15, 100–110])` → export | | 20.000 s |

The `"loudnorm"` rows above were measured when `normalize: true` still meant loudnorm.

### Normalize: fast vs loudnorm (measured 2026-11-16)

Headless Chromium (Playwright), `next dev`, a temporary dev page calling `exportAudio` /
`exportSegments`. Files: a 180 s excerpt of a real music recording (320 kbps, 48 kHz, -15.7
LUFS, peak -1.1 dBTP), the same excerpt 12 dB quieter (192 kbps, 44.1 kHz, -28.0 LUFS), and a
synthetic tone + noise file (-41.3 LUFS). MP3 output; times are medians of 3 interleaved runs after
a warm-up; loudness / true peak checked with native FFmpeg 8 `-af ebur128=peak=true`.

| Export (MP3) | plain | `normalize: true` (fast) | `normalize: "loudnorm"` |
|---|---|---|---|
| quiet file, 2 cuts → 160 s | 1.4 s | **2.3 s** · -16.0 LUFS · -1.8 dBTP | 5.8 s · -15.4 LUFS · **-0.9 dBTP** |
| quiet file, whole 180 s | 1.6 s | **2.5 s** · -15.9 LUFS · -1.9 dBTP | 6.4 s |
| real file, 2 cuts → 160 s | 1.5 s | **2.3 s** · -15.9 LUFS · -1.6 dBTP | 5.7 s · -15.4 LUFS · -1.2 dBTP |
| real file, whole 180 s | 1.5 s | **2.7 s** · -16.0 LUFS · -1.6 dBTP | 6.0 s |
| synthetic -41 LUFS, 2 cuts (+25 dB gain) | 1.5 s | 2.9 s · -16.0 LUFS · -1.9 dBTP | 6.5 s · -16.0 LUFS · -1.4 dBTP |

- Pass 1 alone (ebur128 measure) took 0.45–0.5 s; the oversampled limiter adds ~0.5 s to the
  export pass. Output durations are identical to the plain export.
- `exportSegments`, 3 segments of the quiet file, fast: 2.5 s (loudnorm 5.1 s); each file
  -16.0 LUFS, true peak -1.5 / -1.7 / -3.7 dBTP, per-segment gains 13.1 / 12.4 / 10.7 dB.
- WAV 60 s clip: -16.0 LUFS, -2.3 dBTP. M4R 35 s + `fade {in 1, out 2}`: -16.3 LUFS (the fades
  lower it slightly), -1.6 dBTP, 35.000 s. 10 s of digital silence: gain 0, output stays silent.
- loudnorm took ~6 s here, not the 13 s in the table above (different test file and run); either
  way fast mode is 2.3–2.7 s, about 0.9 s more than a plain export.

---

## How Cut Regions Work

The UI marks sections to **DELETE** (shown in red on the waveform).
On export, `invertRegions()` (`lib/audio/regions.ts`, re-exported by `lib/ffmpeg.ts`) flips them
to find what to **keep**. A future "keep mode" converts the other way with `keepToCuts()`.

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

## Editor Features (components/editor/)

- Drag-and-drop or browse upload
- Waveform (360 px tall, purple→blue gradient), top timeline ruler, overview minimap
- Hover cursor with time readout
- Logarithmic zoom slider, calibrated per file (see below), up to 2000 px/sec
- Play/pause, ±5 s skip, seek bar, volume + mute, playback speed
- Undo / redo / reset of region changes
- Preview modal (HTML5 `<audio>` of the merged result) with download
- Output filename input (used as the download name)
- Fullscreen waveform (Esc exits)
- Toast notifications (`toast/ToastProvider.tsx`): success after Export and after "Download MP3"
  in the preview, errors when Preview/Export fail (out-of-memory gets the "try a shorter or
  compressed file" wording). Auto-dismiss (5 s, errors 10 s), pause on hover/focus, close button;
  errors are `role="alert"`, others `role="status"` inside an `aria-live="polite"` viewport.
  **Never use `alert()`** in the editor — call `useToast()` instead.

**Not implemented here (exists only in the local app):** keyboard shortcuts other than Esc,
session auto-save to localStorage, region loop / mini-player, light theme, YouTube download.

**Where new editor features go (wave 3):** keyboard shortcuts → one keydown effect in
`EditorSession.tsx` (next to the Esc handler) calling the same callbacks the buttons use; session
auto-save → an effect on `history.regions` in `EditorSession`; new FFmpeg actions (remove silence,
normalize, split export, formats) → extend `useFFmpegJob` and reuse its `run()` /
`reportFailure()`; new buttons → `ui/ActionButtons.tsx` (rendered as `PlaybackBar` children).

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
EditorSession (key = url)   outputName, zoomSlider, fullscreen
  useRegionHistory          regions[] { id, start, end, wsRef } — source of truth for export
                            hist (useReducer, history.ts) → { history: RegionData[][], ptr }
  useWaveSurfer             duration, currentTime, isPlaying, zoomMin
  usePlayback               speed, volume, muted
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
new history entries.

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

`lib/ffmpeg.ts`, `lib/audio/` and `lib/posts.ts` have no React imports (`lib/audio/` has no DOM
or FFmpeg imports either, so it runs in Vitest's Node environment).

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
  dates), `lib/audio/*.test.ts` (`regions.test.ts`: `invertRegions`, mirroring the Python tests
  of the local app, and the `keepToCuts` round trip; `args.test.ts`: filter graphs and args per
  format / normalize / fade / split; `formats.test.ts`; `silence.test.ts`: silencedetect logs
  captured from the wasm core and native FFmpeg; `loudness.test.ts`: ebur128 summaries and
  `ametadata` files captured the same way, gain rules; `log.test.ts`), `lib/ffmpeg.test.ts` (public
  API surface of the entry point),
  `components/editor/history.test.ts` (undo/redo reducer: push drops the redo branch, undo/redo
  at the ends are no-ops, reset, clear, immutability) and `components/editor/editorUtils.test.ts`
  (time format, zoom scale, file metadata). Vitest runs in Node, so keep `history.ts` /
  `editorUtils.ts` free of React and DOM. Config: `vitest.config.ts`. Known bugs are written as `it.fails(...)`: when you fix one, Vitest
  reports that test as failing — change it to `it(...)`.
- **E2E smoke (Playwright)** — `e2e/editor-smoke.spec.ts`: opens `/editor`, uploads
  `e2e/fixtures/tone-5s.mp3`, drags a cut on the waveform, clicks Export and checks that an `.mp3`
  downloads. `playwright.config.ts` runs `npm run build && npm run start` itself (or reuses a server
  already on port 3000 outside CI — stop `npm run dev` first if you want to test a fresh build).
  It needs internet: the FFmpeg core comes from unpkg. First time: `npx playwright install chromium`.
- Test files are excluded from `tsconfig.json` so `next build` never type-checks them;
  `tsconfig.test.json` covers them instead (`npm run typecheck`).
- The waveform wrapper in `ui/WaveformCard.tsx` carries `data-testid="waveform"` — keep it when
  refactoring, the smoke test drags on it. Other editor test ids: `drop-zone`, `editor-toolbar`,
  `waveform-card`, `playback-bar`, `region-list`, `region-list-compact`, `preview-modal`,
  `toast-viewport`, `toast-success` / `toast-error` / `toast-info`.
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
