# CLAUDE.md — Project Intelligence for MP3 Studio

> **Read this entire file before making any changes.**
> It contains the architecture, design decisions, and critical rules that keep this project working correctly.

---

## What This Project Is

A **local web application** for downloading YouTube audio or uploading local audio files, converting to MP3, and trimming them with a visual waveform editor. Works with any audio.

The app runs on the user's own machine via `run.bat` (Windows) or `run.sh` (Mac/Linux). There is no cloud backend — everything runs locally via Flask on `localhost:5000`.

**Tech stack:**
- **Backend:** Python 3.10+, Flask 3.0, yt-dlp, FFmpeg
- **Frontend:** Vanilla ES modules (no build step), WaveSurfer.js v7 (CDN), Inter + JetBrains Mono fonts
- **No React, no TypeScript, no bundler** — plain HTML/CSS/JS with `type="module"` scripts

---

## How to Run

```
# Windows
Double-click run.bat   (auto-installs Python, FFmpeg, pip packages on first run)

# Mac / Linux
bash run.sh
```

Server starts at `http://localhost:5000`. Static files are never cached (`SEND_FILE_MAX_AGE_DEFAULT = 0`).

**Every time you change a JS or CSS file, bump the `?v=N` cache-buster** on the script tag in `templates/index.html`. Current version: `?v=10`.

---

## File Structure

```
mp3-studio/
├── app.py                  ← Flask backend (all API endpoints)
├── requirements.txt        ← pip dependencies
├── run.bat                 ← Windows launcher (auto-installs everything)
├── run.sh                  ← Mac/Linux launcher
├── CLAUDE.md               ← THIS FILE
├── README.md               ← User-facing documentation
├── templates/
│   └── index.html          ← Single HTML page (all UI, no JS inline)
├── static/
│   ├── css/
│   │   └── style.css       ← All styles (dark/light glassmorphic theme)
│   └── js/
│       ├── app.js          ← Entry point (~25 lines, just boots on DOMContentLoaded)
│       ├── constants.js    ← Shared constants (palette, intervals, skip duration)
│       ├── utils.js        ← Pure helpers: time format/parse, escape, file size
│       ├── state.js        ← App state singleton + History undo/redo stack
│       ├── api.js          ← All fetch() calls to Flask (no DOM, no state)
│       ├── ui.js           ← Generic DOM helpers (toasts, steps, seek bar, modals, theme)
│       ├── regions.js      ← Region CRUD, list rendering, inline time editor
│       ├── wavesurfer.js   ← WaveSurfer v7 lifecycle, minimap, cursor, zoom UI
│       ├── upload.js       ← Upload tab: drag-drop, XHR upload with progress
│       └── events.js       ← All event wiring, async flows, session save/restore, loop, shortcuts
└── temp_audio/             ← Auto-created, gitignored. Holds temp MP3 files.
```

---

## Frontend Module Dependency Graph

**This is the most critical section. Violating it causes circular import errors.**

```
app.js
 ├── events.js   imports: state, regions, wavesurfer, ui, api, upload, utils, constants
 ├── upload.js   imports: state, ui, utils, wavesurfer
 └── wavesurfer.js
       imports: state, regions, ui, utils, constants  +  WaveSurfer CDN plugins
       └── regions.js
             imports: state, ui, constants, utils
             └── ui.js
                   imports: state, utils
                   └── state.js   (NO imports — pure data)

utils.js      — NO imports
constants.js  — NO imports
api.js        — NO imports
```

**Rules:**
- `state.js` has zero imports. Nothing imports from `events.js` or `app.js`.
- `ui.js` does NOT import from `regions.js` or `wavesurfer.js`.
- `regions.js` does NOT import from `wavesurfer.js`.
- `wavesurfer.js` does NOT import from `events.js` or `upload.js`.

### Custom DOM Events (decoupled communication without imports)

Because `regions.js` cannot import from `events.js` (circular), they communicate via DOM events:

| Event | Dispatched by | Listened by | Purpose |
|-------|--------------|-------------|---------|
| `ws-ready` | `wavesurfer.js` (in `ws.on("ready")`) | `events.js` | Triggers session restore after audio loads |
| `regions-changed` | `regions.js` (in `renderRegionsList`) | `events.js` | Triggers auto-save to localStorage |
| `region-contextmenu` | `regions.js` (on right-click) | `events.js` | Shows loop/remove context menu |

**Critical:** The `ws-ready` listener uses `{ once: true }` and is re-registered in `handleNewSession()` for each new audio session.

---

## State Management

Everything lives in `State` in `state.js`. There is no other global state.

```js
State = {
  // Audio source meta
  taskId, filename, title, duration, thumbnail, channel, videoUrl,

  // WaveSurfer instances (set by wavesurfer.js)
  ws, wsRegions, isPlaying,

  // Regions  { id → { wsRef, start, end, colorIdx, label } }
  regionMap: Map,
  colorCycle: number,

  // Undo/redo
  history: [], histPtr: -1,

  // Preview modal
  previewActive: bool,
  currentPreviewFile: string|null,   // "prev_xxx.mp3"
  activeRegionId: string|null,

  // Loop region
  loopActive:   bool,
  loopRegionId: string|null,

  // Polling
  pollTimer,
}
```

**`History` in `state.js` — critical rule:**
`History.push()`, `History.undo()`, `History.redo()`, and `History.clear()` do **NOT** call `UI.refreshHistoryButtons()`. Every caller is responsible for calling it afterward. This keeps `state.js` free of any imports.

---

## Backend API Endpoints

All in `app.py`. Security: every filename is validated with regex before use.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/` | Serve `index.html` |
| `POST` | `/api/info` | Fetch YouTube metadata (no download) |
| `POST` | `/api/download` | Start async yt-dlp download, returns `task_id` |
| `GET`  | `/api/status/<task_id>` | Poll download progress |
| `POST` | `/api/upload` | Accept local audio file, convert to MP3 if needed |
| `GET`  | `/api/audio/<uuid>.mp3` | Stream source MP3 to WaveSurfer |
| `POST` | `/api/preview_export` | Merge kept regions into a preview MP3 (no save dialog) |
| `GET`  | `/api/preview_audio/prev_<hex>.mp3` | Stream preview MP3 to modal player |
| `POST` | `/api/save_preview` | Open OS folder picker, copy preview file there |
| `POST` | `/api/export_stream` | SSE export — streams real FFmpeg progress to client |
| `POST` | `/api/export` | Classic export — folder picker, FFmpeg stitch, save (no SSE) |
| `POST` | `/api/cleanup` | Delete source + preview temp files |

**Filename validation:**
- Source MP3: `_valid_mp3()` — must match UUID4 + `.mp3`
- Preview MP3: `_valid_preview()` — must match `prev_` + 16 hex chars + `.mp3`

**Key backend globals:**
- `_last_filename` — auto-deleted when a new download starts
- `_current_preview` — auto-deleted when a new preview is generated
- `_tasks` — in-memory dict of download task states

**Custom title:** `/api/export`, `/api/export_stream`, and `/api/save_preview` all accept an optional `custom_title` field in the request body. If provided, it overrides `title` for the output filename.

**SSE Export helpers:**
- `_ffmpeg_trim_progress(src, dst, start, end, seg_dur, pct_start, pct_end)` — runs FFmpeg with `-progress pipe:1 -nostats` and yields integer progress values by parsing `out_time_ms=` lines
- `_ffmpeg_concat_progress(concat_list, dst, total_dur, pct_start, pct_end)` — same for the concat step

**Region logic:** The app marks parts to **DELETE** (cut regions). The backend inverts them to get keep-regions before calling FFmpeg. `_invert_regions(cut_regions, duration)` handles this.

---

## How Cut Regions Work

The user marks parts they want to **remove** (shown in red on the waveform). The regions are stored in `State.regionMap`. On export or preview:
1. Frontend sends cut regions to backend
2. Backend calls `_invert_regions()` to find the gaps (kept parts)
3. FFmpeg extracts each kept segment and concatenates them into the output MP3

This means: regions = parts to DELETE, everything OUTSIDE regions = saved.

---

## Session Auto-Save

Regions are automatically saved to `localStorage` whenever they change.

- **Key format:** `mp3studio:session:${filename}` (filename = UUID4 + .mp3)
- **Value:** `{ regions: [...], savedAt: timestamp }`
- **Save trigger:** `regions-changed` DOM event → `saveSession()` in `events.js`
- **Restore trigger:** `ws-ready` DOM event → `restoreSession()` in `events.js` — uses `{ once: true }` and is re-registered in `handleNewSession()`
- **Restore behavior:** Calls `Regions._create()` for each saved region with `addToHistory = false`, then calls `History.clear()` so undo history starts fresh
- **Theme preference:** Stored separately at `mp3studio:theme` (`"dark"` or `"light"`)

---

## Waveform Editor Layout

From top to bottom inside `.waveform-card`:

```
[waveform-header]     label | Cursor time | Playhead time | Fullscreen btn
[minimap-mount]       Full-overview minimap (un-zoomed, always shows full audio)
[timeline-mount]      Time ruler — scrolls in sync with waveform when zoomed
[waveform-mount-wrap] WaveSurfer waveform + hover cursor overlay
[zoom-bar]            − | [full-width slider] | + | Fit | 25×
[waveform-hint]       Instruction text
```

**Timeline scroll sync:** The `#timeline-mount` div has `overflow-x: scroll` with hidden scrollbar. `WS.init()` listens to `ws.on("scroll", scrollLeft => ...)` and sets `timelineMount.scrollLeft = scrollLeft`.

**Minimap:** Uses WaveSurfer's `MinimapPlugin` imported from CDN. Container is `#minimap-mount`. Shows regions and allows click-to-seek without affecting zoom level.

---

## Preview Modal Flow

1. User clicks **Preview** button (or presses P)
2. `_generatePreview()` in `events.js` calls `POST /api/preview_export`
3. Backend merges kept regions → saves `prev_xxx.mp3` to temp folder
4. Returns `{ preview_filename, preview_duration, kept_segments }`
5. `UI.showPreviewModal()` opens the modal, loads audio via `GET /api/preview_audio/`
6. User listens with a custom HTML5 audio player (NOT WaveSurfer)
7. **Save MP3** → `POST /api/save_preview` → folder picker → copy file → done
8. **Continue Editing** → `UI.hidePreviewModal()` → all cut regions remain intact

---

## CSS Design System

All colors/sizes in CSS custom properties at the top of `style.css`:

```css
--bg: #06060f              /* page background */
--surface: #0d0d1c
--card: #111128            /* card background */
--card-border: #1e1e40
--primary: #7c3aed         /* purple — main brand */
--primary-light: #9d67f5
--primary-dim: rgba(124,58,237,.15)
--primary-glow: rgba(124,58,237,.35)
--secondary: #1d4ed8       /* blue */
--accent: #06b6d4          /* cyan */
--success: #10b981
--error: #ef4444
--text: #f1f5f9
--text-muted: #94a3b8
--text-dim: #475569
--font: 'Inter', system-ui, sans-serif
--font-mono: 'JetBrains Mono', monospace
```

**Light theme:** Applied via `[data-theme="light"]` attribute on `<html>`. Overrides all CSS variables. Toggle via `UI.toggleTheme()`, persisted in `localStorage` at `mp3studio:theme`.

Theme: dark glassmorphic, purple-teal gradient. Cards use `backdrop-filter: blur(14px)`.

**Button variants:** `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-ghost`, `.btn-play`
**Sizes:** `.btn-sm`, `.btn-icon`, `.btn-icon-label`, `.btn-full`

---

## Key Design Decisions & Why

**1. No circular dependencies**
Took significant effort to establish. `regions.js` uses `State.ws?.setTime()` directly instead of `WS.seek()` to avoid importing `wavesurfer.js`. Cross-module communication uses DOM custom events instead of imports.

**2. History callers must refresh buttons**
`History.push/undo/redo/clear` do not call `UI.refreshHistoryButtons()`. If you add a new place that modifies history, you MUST call `UI.refreshHistoryButtons()` afterward.

**3. Preview uses HTML5 `<audio>`, not a second WaveSurfer instance**
A second WaveSurfer would be heavy and complex. The preview modal just needs a simple player.

**4. Cut regions = parts to DELETE (not keep)**
This is counterintuitive but deliberate. Users drag over the parts they want to remove. The visual is red (danger = cut). The inversion happens on the backend.

**5. Static files never cached**
`app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0` prevents browsers from caching old JS/CSS. Still bump `?v=N` on the script tag whenever JS changes, as an extra safety net.

**6. SSE export uses `-progress pipe:1`**
FFmpeg's structured progress output is captured from stdout using `-progress pipe:1 -nostats`. This gives clean `out_time_ms=NNNN` lines that are easy to parse without regex.

**7. Loop uses requestAnimationFrame, not setInterval**
The loop watcher uses `requestAnimationFrame` for smooth, low-latency region boundary detection. It stores the RAF ID in `State._loopRAF` and is cancelled by `_stopLoop()`.

---

## Things That Will Break If You're Not Careful

1. **Adding a new import that creates a circular dependency** — will silently fail in browser with a confusing error. Always check the dependency graph above before adding imports.

2. **Forgetting to call `UI.refreshHistoryButtons()` after `History.push/undo/redo`** — the undo/redo buttons will show wrong disabled state.

3. **Forgetting to bump `?v=N` in `index.html` after changing any JS file** — browser may serve cached old code.

4. **Adding a new temp file type without cleaning it up** — check `api_cleanup()` and `_purge_temp_dir()` in `app.py`.

5. **Using `WS.seek()` inside `regions.js`** — this would create a circular import. Always use `State.ws?.setTime()` directly in `regions.js`.

6. **Not re-registering the `ws-ready` listener in `handleNewSession()`** — the second audio load won't trigger session restore. The listener uses `{ once: true }` and must be re-added each time.

7. **The `Preview` object in `wavesurfer.js`** is exported but no longer used. Do not call it. The new preview flow is entirely in `events.js` → `api.js` → `app.py`.

---

## Keyboard Shortcuts Reference

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `N` | Drop a 10s cut region centered on playhead |
| `P` | Open Preview modal (generate merged audio) |
| `L` | Stop looping region |
| `F` | Toggle fullscreen waveform |
| `?` | Open keyboard shortcuts overlay |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `←` / `→` | Skip 5 seconds |
| `Double-click region` | Remove that cut |
| `Right-click region` | Loop / Remove context menu |
| `Delete` (on focused region row) | Remove that cut |
| `Esc` | Exit fullscreen / close modals |

---

## Allowed Audio Upload Formats

`.mp3`, `.wav`, `.m4a`, `.aac`, `.ogg`, `.flac`, `.opus` — all auto-converted to MP3 via FFmpeg if not already MP3. Max upload size: 500 MB.
