<div align="center">

# 🎵 MP3 Studio

**Download · Upload · Convert · Trim any audio**

*A beautifully designed local web app for downloading YouTube audio or uploading your own files,  
converting to high-quality MP3, and precision-trimming with a visual waveform editor.*

![Python](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python)
![Flask](https://img.shields.io/badge/Flask-3.0-black?logo=flask)
![WaveSurfer](https://img.shields.io/badge/WaveSurfer.js-v7-purple)
![License](https://img.shields.io/badge/License-MIT-green)

</div>

---

## 🚀 Setup Guide (Non-Technical Users)

**Double-click `run.bat`. That's it.**

The script handles everything automatically:

| | What | How |
|---|---|---|
| ✅ | **Python** | Auto-downloaded and silently installed |
| ✅ | **FFmpeg** | Auto-installed via Windows Package Manager |
| ✅ | **All Python packages** | Auto-installed via pip |
| ✅ | **Browser opens** | Automatic |

> The first run takes **3–5 minutes** while things install.
> Every run after that starts in **a few seconds**.

> **Note:** If you see *"Please close and run again"* — just do that once.
> This only happens if Windows needs a PATH refresh after a fresh Python install.

---

## ✨ Features

### Audio Source
- **YouTube to MP3** — paste any YouTube URL, fetches metadata preview, downloads at 320 kbps
- **Upload local file** — drag & drop or browse to upload MP3, WAV, M4A, AAC, OGG, FLAC, or OPUS (up to 500 MB). Non-MP3 formats auto-converted.

### Waveform Editor
- **Visual waveform** — full audio waveform with precise timeline and zoom up to 2000×
- **Minimap overview** — a full-width mini waveform above the editor that stays un-zoomed, showing cut regions in context while you're zoomed deep into a section. Click anywhere on it to jump there instantly.
- **Hover time cursor** — floating cursor line + badge shows the exact time (millisecond precision) as your mouse moves over the waveform
- **Time bar header** — always-visible display showing **Cursor** time and **Playhead** time in `M:SS.mmm` format, stable regardless of zoom level
- **Top timeline ruler** — time tick marks placed directly above the waveform; scrolls in sync when zoomed
- **Full-width zoom slider** — wide slider at the bottom with gradient thumb, fill indicator, and live zoom badge (e.g. `25×`, `1.5k×`)
- **Fullscreen mode** — press `F` to expand the waveform to fill your entire screen
- **Multi-region cut trimming** — drag on the waveform to mark parts to **delete** (shown in red)
- **Precision time editing** — click any timestamp in the region list to type an exact value
- **Loop region** — right-click any cut region to open a context menu. Choose **Loop region** to play it on repeat so you can listen carefully before deciding. Press `L` to stop.
- **Merged output** — all remaining segments are stitched together seamlessly into one MP3
- **Preview Export** — generates a full merged MP3 of the kept parts and plays it back in a modal player so you can listen before saving
- **Undo / Redo** — full history for every cut action (Ctrl+Z / Ctrl+Y)
- **Reset** — clear all cuts and start fresh without re-downloading or re-uploading

### Smart Session Saving
- **Auto-save** — every cut region is automatically saved to your browser's local storage, keyed to that audio file
- **Auto-restore** — if you refresh the page or reopen the app, your cuts come back automatically with a restore banner
- **Clear saved** — a "Clear saved" button lets you wipe the saved session whenever you want

### Export & Files
- **Custom output filename** — an editable filename field in the editor lets you name your MP3 before saving
- **Real export progress** — the Export button shows a live progress bar as FFmpeg processes each segment
- **Choose save folder** — native OS folder picker opens on export
- **Auto temp cleanup** — temp files deleted automatically on new session or server restart
- **320 kbps quality** — best audio quality preserved throughout

### UI & Accessibility
- **Dark / Light theme** — toggle between a dark glassmorphic theme and a clean light theme. Preference is saved and restored on every launch.
- **Keyboard shortcut overlay** — press `?` at any time to open a modal showing every keyboard shortcut

---

## 🎛 How to Use

### From YouTube
1. Click the **YouTube Link** tab
2. Paste a YouTube URL and click **Fetch** to preview the video
3. Click **Download & Convert to MP3**
4. The waveform editor opens when ready

### From a local file
1. Click the **Upload MP3** tab
2. Drag & drop your audio file onto the drop zone, or click **Browse Files**
3. Click **Open in Waveform Editor**

### Trimming
4. **Drag on the waveform** to mark parts you want to **remove** (shown in red)
5. **Resize** a cut by dragging its left or right edge
6. **Click a timestamp** in the region list to type an exact time (e.g. `0:15` or `1:23.5`)
7. **Right-click a region** to loop it and listen carefully before committing
8. **Edit the filename** in the output field at the top before saving
9. Click **Preview** — the app merges the kept parts server-side and opens a player modal
   - Listen to confirm everything sounds right
   - Click **Save MP3** to pick a save folder and download
   - Or click **Continue Editing** to go back and adjust (all your cuts remain untouched)
10. Alternatively, click **Export MP3** directly → watch the real progress bar → done!

### Other controls
- Use **Reset** to clear all cuts (audio stays loaded)
- Use **Home** to go back and start a new session
- Use **Undo / Redo** for any mistakes
- Press `?` to see all keyboard shortcuts

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `N` | Drop a 10-second cut region centered on the playhead |
| `P` | Generate preview of kept regions |
| `L` | Stop looping region |
| `F` | Toggle fullscreen waveform |
| `?` | Open keyboard shortcuts overlay |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `←` / `→` | Skip 5 seconds |
| `Double-click region` | Remove that cut |
| `Right-click region` | Loop / Remove context menu |
| `Delete` (on focused region) | Remove that cut |
| `Esc` | Exit fullscreen / close modal |

---

## 🏗 Project Structure

```
mp3-studio/
├── app.py                  # Flask backend (download, upload, convert, export, SSE)
├── requirements.txt        # Python packages (auto-installed)
├── run.bat                 # Windows launcher — double-click to start
├── run.sh                  # macOS/Linux launcher
├── templates/
│   └── index.html          # Single-page UI (YouTube + Upload tabs, waveform editor)
├── static/
│   ├── css/style.css       # Dark/light theme, glass morphism, responsive styles
│   └── js/
│       ├── app.js          # Entry point — boots on DOMContentLoaded (~25 lines)
│       ├── constants.js    # Shared constants (palette, poll interval, skip seconds)
│       ├── utils.js        # Pure helpers: time format/parse, HTML escape, file size
│       ├── state.js        # State singleton + History command stack (undo/redo)
│       ├── api.js          # Fetch wrappers including SSE exportStream
│       ├── ui.js           # DOM helpers (toast, steps, seek bar, theme, modals)
│       ├── regions.js      # Region CRUD, list rendering, inline time editor
│       ├── wavesurfer.js   # WaveSurfer v7 lifecycle, minimap, hover cursor, zoom UI
│       ├── upload.js       # Upload tab: drag-drop, XHR upload with progress
│       └── events.js       # Event wiring, session save/restore, loop, shortcuts
└── temp_audio/             # Auto-cleaned temp folder (gitignored)
```

### Frontend module dependency graph

```
app.js
  ├── events.js   → state, regions, wavesurfer, ui, api, upload, constants, utils
  ├── upload.js   → state, ui, utils, wavesurfer
  └── wavesurfer.js → state, regions, ui, utils, constants
         └── regions.js → state, ui, constants, utils
                └── ui.js → state, utils
                      └── state.js (no imports)
```

All imports are strictly one-way — no circular dependencies.
Inter-module communication without imports uses custom DOM events:
- `ws-ready` — dispatched by wavesurfer.js when audio loads; events.js restores saved session
- `regions-changed` — dispatched by regions.js on every change; events.js auto-saves to localStorage
- `region-contextmenu` — dispatched by regions.js on right-click; events.js shows context menu

---

## ⚙️ API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/info` | Fetch YouTube video metadata |
| `POST` | `/api/download` | Start async YouTube download |
| `GET`  | `/api/status/<id>` | Poll download progress |
| `POST` | `/api/upload` | Upload a local audio file |
| `GET`  | `/api/audio/<file>` | Stream source MP3 to WaveSurfer |
| `POST` | `/api/preview_export` | Merge kept regions into a preview MP3 |
| `GET`  | `/api/preview_audio/<file>` | Stream the preview MP3 to the modal player |
| `POST` | `/api/save_preview` | Save preview MP3 to user-chosen folder |
| `POST` | `/api/export_stream` | SSE export — streams real FFmpeg progress |
| `POST` | `/api/export` | Classic export (no SSE, kept as fallback) |
| `POST` | `/api/cleanup` | Delete temp files (source + preview) |

---

## 📋 What Gets Installed Automatically

| Dependency | How |
|---|---|
| **Python** | Auto-installed by `run.bat` via winget or silent installer |
| **FFmpeg** | Auto-installed by `run.bat` via winget |
| **Flask** | Auto-installed by `run.bat` via pip |
| **yt-dlp** | Auto-installed by `run.bat` via pip |
| **flask-cors** | Auto-installed by `run.bat` via pip |

Everything is handled by `run.bat` on first launch. No manual steps required.

---

## ⚠️ Disclaimer

This tool is intended for **personal, non-commercial use only**.

- Only download content you have the legal right to download.
- Downloading YouTube videos may violate [YouTube's Terms of Service](https://www.youtube.com/t/terms). Use responsibly.
- Audio content downloaded from YouTube may be copyrighted by its respective creators.
- The developers of this project are **not responsible** for any misuse or ToS violations by end users.

---

## 📄 License

MIT — free to use, modify, and share.

---

<div align="center">
Made with ❤️ for audio lovers
</div>
