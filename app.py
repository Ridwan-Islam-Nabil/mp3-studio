"""
╔══════════════════════════════════════════════════════════╗
║              MP3 Studio – Flask Backend                  ║
║  Download · Convert · Trim YouTube audio to MP3          ║
╚══════════════════════════════════════════════════════════╝
"""

import os
import re
import uuid
import json
import logging
import threading
import subprocess
from pathlib import Path
from flask import Flask, request, jsonify, render_template, send_file, abort, Response, stream_with_context
from flask_cors import CORS
import yt_dlp


# ── App Bootstrap ──────────────────────────────────────────────────────────────

app = Flask(__name__)
CORS(app)
app.config["MAX_CONTENT_LENGTH"]       = 500 * 1024 * 1024   # 500 MB upload limit
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0                   # Never cache static files locally

# ── Silence noisy loggers ──────────────────────────────────────────────────────
# Suppress Flask's per-request access log (the 200 GET /api/status lines)
logging.getLogger("werkzeug").setLevel(logging.ERROR)
# Only show our own clean print() messages in the terminal

BASE_DIR  = Path(__file__).parent
TEMP_DIR  = BASE_DIR / "temp_audio"
TEMP_DIR.mkdir(exist_ok=True)

# ── Startup cleanup ────────────────────────────────────────────────────────────
# Wipe any leftover temp files from previous server runs.
# If the server restarted, every prior session is already dead.
def _purge_temp_dir():
    removed = 0
    for f in TEMP_DIR.iterdir():
        try:
            f.unlink()
            removed += 1
        except Exception:
            pass
    if removed:
        print(f"🧹  Cleaned up {removed} leftover temp file(s) on startup.")

_purge_temp_dir()

# In-memory task registry  {task_id -> dict}
_tasks: dict[str, dict] = {}
_lock   = threading.Lock()
# Track the last downloaded filename so we can auto-delete it on next download
_last_filename: str | None = None
# Track the current preview file so we can clean it up when a new preview is generated
_current_preview: str | None = None


# ── Utility Helpers ────────────────────────────────────────────────────────────

def _safe_name(name: str, max_len: int = 100) -> str:
    """Strip unsafe chars and return a filesystem-safe filename stem."""
    # Keep Unicode letters (Arabic etc.), digits, spaces, hyphens, underscores
    name = re.sub(r"[^\w\s\-\u0600-\u06FF]", "", name, flags=re.UNICODE)
    name = re.sub(r"\s+", "_", name.strip())
    return name[:max_len] or "audio"


def _fmt_duration(seconds: float | None) -> str:
    """Convert float seconds → 'H:MM:SS' or 'M:SS' string."""
    if not seconds:
        return "0:00"
    s = int(seconds)
    h, m, s = s // 3600, (s % 3600) // 60, s % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def _task_update(task_id: str, **kwargs):
    with _lock:
        if task_id in _tasks:
            _tasks[task_id].update(kwargs)


def _valid_mp3(name: str) -> bool:
    """Validate that a filename is exactly a UUID4 + .mp3 (security check)."""
    return bool(re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp3", name))


def _valid_preview(name: str) -> bool:
    """Validate a preview filename: prev_ + 16 hex chars + .mp3"""
    return bool(re.fullmatch(r"prev_[0-9a-f]{16}\.mp3", name))


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


# ── 1. Fetch video metadata ────────────────────────────────────────────────────

@app.route("/api/info", methods=["POST"])
def api_info():
    """Return YouTube video metadata (no download)."""
    data = request.get_json(force=True, silent=True) or {}
    url  = data.get("url", "").strip()

    if not url:
        return jsonify({"error": "URL is required"}), 400

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        return jsonify({
            "title":        info.get("title", "Unknown"),
            "channel":      info.get("channel") or info.get("uploader", ""),
            "duration":     info.get("duration", 0),
            "duration_str": _fmt_duration(info.get("duration")),
            "thumbnail":    info.get("thumbnail", ""),
            "view_count":   info.get("view_count", 0),
        })

    except yt_dlp.utils.DownloadError as exc:
        msg = str(exc).lower()
        if any(k in msg for k in ("private", "unavailable", "not available")):
            return jsonify({"error": "Video is private or unavailable."}), 400
        return jsonify({"error": "Could not fetch video info – check the URL."}), 400

    except Exception as exc:
        return jsonify({"error": f"Unexpected error: {exc}"}), 500


# ── 2. Start async download ────────────────────────────────────────────────────

@app.route("/api/download", methods=["POST"])
def api_download():
    """Kick off a background download task and return its task_id."""
    global _last_filename

    data = request.get_json(force=True, silent=True) or {}
    url  = data.get("url", "").strip()

    if not url:
        return jsonify({"error": "URL is required"}), 400

    # ── Auto-delete the previous session's temp file ───────────────────────────
    if _last_filename and _valid_mp3(_last_filename):
        old_path = TEMP_DIR / _last_filename
        if old_path.exists():
            old_path.unlink(missing_ok=True)
            print(f"🧹  Auto-deleted previous temp file: {_last_filename}")
        _last_filename = None

    task_id = str(uuid.uuid4())
    with _lock:
        _tasks[task_id] = {
            "status":   "pending",
            "progress": 0,
            "message":  "Initialising…",
        }

    thread = threading.Thread(
        target=_download_worker,
        args=(task_id, url),
        daemon=True,
    )
    thread.start()

    return jsonify({"task_id": task_id})


def _download_worker(task_id: str, url: str):
    """Background: download audio, convert to 320 kbps MP3 via yt-dlp + ffmpeg."""

    def _hook(d):
        status = d.get("status")
        if status == "downloading":
            total      = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            speed      = d.get("speed") or 0
            if total > 0:
                pct       = (downloaded / total) * 75          # 0–75 % for download phase
                speed_str = f"{speed / 1_048_576:.1f} MB/s" if speed else ""
                _task_update(
                    task_id,
                    status   = "downloading",
                    progress = round(pct, 1),
                    message  = f"Downloading… {pct * 100 / 75:.0f}%  {speed_str}".strip(),
                )
        elif status == "finished":
            _task_update(task_id, status="converting", progress=82,
                         message="Converting to MP3 (320 kbps)…")

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": str(TEMP_DIR / f"{task_id}.%(ext)s"),
        "postprocessors": [{
            "key":             "FFmpegExtractAudio",
            "preferredcodec":  "mp3",
            "preferredquality": "320",
        }],
        "progress_hooks": [_hook],
        "quiet":       True,
        "no_warnings": True,
        "noprogress":  True,   # suppress [download] X% lines in terminal
    }

    try:
        _task_update(task_id, status="downloading", progress=2, message="Connecting…")

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)

        mp3_path = TEMP_DIR / f"{task_id}.mp3"
        if not mp3_path.exists():
            raise FileNotFoundError("MP3 conversion produced no output file.")

        # Record this as the latest temp file for auto-cleanup on next download
        global _last_filename
        _last_filename = f"{task_id}.mp3"

        _task_update(
            task_id,
            status       = "done",
            progress     = 100,
            message      = "Ready!",
            filename     = f"{task_id}.mp3",
            title        = info.get("title", "audio"),
            duration     = info.get("duration", 0),
            duration_str = _fmt_duration(info.get("duration")),
            thumbnail    = info.get("thumbnail", ""),
            channel      = info.get("channel") or info.get("uploader", ""),
        )

    except Exception as exc:
        _task_update(task_id, status="error", progress=0, message=str(exc))


# ── 3. Poll task status ────────────────────────────────────────────────────────

@app.route("/api/status/<task_id>")
def api_status(task_id: str):
    with _lock:
        task = _tasks.get(task_id)
    if task is None:
        return jsonify({"error": "Task not found"}), 404
    return jsonify(task)


# ── 4. Serve the downloaded audio to the browser / WaveSurfer ─────────────────

@app.route("/api/audio/<path:filename>")
def api_audio(filename: str):
    if not _valid_mp3(filename):
        abort(400)
    fp = TEMP_DIR / filename
    if not fp.exists():
        abort(404)
    return send_file(fp, mimetype="audio/mpeg")


# ── 5. Upload local audio file ────────────────────────────────────────────────

ALLOWED_AUDIO = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".opus"}

@app.route("/api/upload", methods=["POST"])
def api_upload():
    """
    Accept a local audio file upload, convert to MP3 if needed,
    and return the same task-style info as a completed download.
    """
    global _last_filename

    if "file" not in request.files:
        return jsonify({"error": "No file attached."}), 400

    f    = request.files["file"]
    name = f.filename or ""
    ext  = Path(name).suffix.lower()

    if not name or ext not in ALLOWED_AUDIO:
        return jsonify({
            "error": f"Unsupported format. Accepted: {', '.join(sorted(ALLOWED_AUDIO))}"
        }), 400

    # Auto-delete previous temp file
    if _last_filename and _valid_mp3(_last_filename):
        (TEMP_DIR / _last_filename).unlink(missing_ok=True)
        _last_filename = None

    file_id  = str(uuid.uuid4())
    mp3_path = TEMP_DIR / f"{file_id}.mp3"

    if ext == ".mp3":
        # Save directly — no conversion needed
        f.save(str(mp3_path))
    else:
        # Save original, convert to MP3 via ffmpeg
        raw_path = TEMP_DIR / f"{file_id}{ext}"
        f.save(str(raw_path))
        try:
            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", str(raw_path),
                    "-acodec", "libmp3lame",
                    "-q:a", "0",
                    str(mp3_path),
                ],
                check=True,
                capture_output=True,
            )
        except subprocess.CalledProcessError as exc:
            raw_path.unlink(missing_ok=True)
            return jsonify({"error": "Conversion failed: " + exc.stderr.decode(errors="replace")}), 500
        finally:
            raw_path.unlink(missing_ok=True)

    duration = _probe_duration(mp3_path)
    title    = Path(name).stem          # filename without extension as title
    _last_filename = f"{file_id}.mp3"

    return jsonify({
        "filename":     f"{file_id}.mp3",
        "title":        title,
        "duration":     duration,
        "duration_str": _fmt_duration(duration),
        "thumbnail":    "",
        "channel":      "Local File",
    })


# ── 6. Export (trim + save) ────────────────────────────────────────────────────

@app.route("/api/export", methods=["POST"])
def api_export():
    """
    Export the MP3 with the user-marked CUT regions removed.
    Regions = parts to DELETE. Everything outside regions is kept and
    stitched together into the final MP3.
    """
    data         = request.get_json(force=True, silent=True) or {}
    filename     = (data.get("filename") or "").strip()
    cut_regions  = data.get("regions", [])     # [{start, end}, …]  ← parts to DELETE
    title        = (data.get("title") or "trimmed_audio").strip()
    custom_title = (data.get("custom_title") or "").strip()
    if custom_title:
        title = custom_title
    duration     = float(data.get("duration") or 0)  # total audio duration in seconds

    # ── Validation ─────────────────────────────────────────────────────────────
    if not _valid_mp3(filename):
        return jsonify({"error": "Invalid filename."}), 400
    # cut_regions may be empty — that means "keep everything" (full audio export)

    source = TEMP_DIR / filename
    if not source.exists():
        return jsonify({"error": "Source file not found – please re-download."}), 404

    # ── Invert cut-regions → keep-regions ─────────────────────────────────────
    # If duration wasn't passed, probe it from the file
    if duration <= 0:
        duration = _probe_duration(source)

    keep_regions = _invert_regions(cut_regions, duration)

    if not keep_regions:
        return jsonify({"error": "Nothing left to keep — your cut regions cover the entire audio."}), 400

    # ── Ask where to save ──────────────────────────────────────────────────────
    save_dir = _pick_folder()
    if save_dir is None:
        return jsonify({"cancelled": True})

    # ── Resolve unique output path ─────────────────────────────────────────────
    stem        = _safe_name(title)
    output_path = Path(save_dir) / f"{stem}.mp3"
    counter     = 1
    while output_path.exists():
        output_path = Path(save_dir) / f"{stem}_{counter}.mp3"
        counter += 1

    try:
        if len(keep_regions) == 1:
            r = keep_regions[0]
            _ffmpeg_trim(source, output_path, r["start"], r["end"])
        else:
            _ffmpeg_concat(source, output_path, keep_regions)

        return jsonify({
            "success":  True,
            "path":     str(output_path),
            "filename": output_path.name,
            "kept_segments": len(keep_regions),
        })

    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.decode(errors="replace") if exc.stderr else "unknown"
        return jsonify({"error": f"FFmpeg error: {stderr}"}), 500

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


def _invert_regions(cut_regions: list[dict], duration: float) -> list[dict]:
    """
    Convert CUT regions into KEEP regions by finding the gaps between them.

    Example:
      duration = 600s
      cut_regions = [{start:0, end:15}, {start:590, end:600}]
      keep_regions = [{start:15, end:590}]
    """
    MIN_GAP = 0.05  # ignore keep-segments shorter than 50 ms

    # Sort and merge overlapping cut regions first
    sorted_cuts = sorted(cut_regions, key=lambda r: float(r["start"]))
    merged: list[tuple[float, float]] = []
    for r in sorted_cuts:
        s, e = float(r["start"]), float(r["end"])
        if merged and s <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))

    keep: list[dict] = []
    cursor = 0.0

    for (s, e) in merged:
        if s - cursor > MIN_GAP:
            keep.append({"start": round(cursor, 4), "end": round(s, 4)})
        cursor = max(cursor, e)

    if duration - cursor > MIN_GAP:
        keep.append({"start": round(cursor, 4), "end": round(duration, 4)})

    return keep


def _probe_duration(path: Path) -> float:
    """Use ffprobe to get audio duration in seconds."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True, text=True, check=True,
        )
        return float(result.stdout.strip())
    except Exception:
        return 0.0


def _pick_folder() -> str | None:
    """Open the OS-native folder-picker dialog and return the chosen path."""
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        root.update()

        folder = filedialog.askdirectory(
            title="Choose where to save your MP3",
            parent=root,
        )
        root.destroy()
        return folder or None

    except Exception:
        # Fallback silently to ~/Downloads if tkinter is unavailable
        fallback = Path.home() / "Downloads"
        fallback.mkdir(parents=True, exist_ok=True)
        return str(fallback)


def _ffmpeg_trim(src: Path, dst: Path, start: float, end: float):
    """Extract [start, end] seconds from src and write to dst as MP3."""
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-i",    str(src),
            "-ss",   str(start),
            "-to",   str(end),
            "-acodec", "libmp3lame",
            "-q:a",  "0",
            str(dst),
        ],
        check=True,
        capture_output=True,
    )


def _ffmpeg_concat(src: Path, dst: Path, regions: list[dict]):
    """Extract multiple regions from src and concatenate them into dst."""
    seg_files   = []
    concat_list = TEMP_DIR / f"{src.stem}_concat.txt"

    try:
        for i, r in enumerate(regions):
            seg = TEMP_DIR / f"{src.stem}_seg{i}.mp3"
            _ffmpeg_trim(src, seg, float(r["start"]), float(r["end"]))
            seg_files.append(seg)

        with open(concat_list, "w", encoding="utf-8") as fh:
            for sf in seg_files:
                fh.write(f"file '{sf.as_posix()}'\n")

        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", str(concat_list),
                "-acodec", "libmp3lame",
                "-q:a",  "0",
                str(dst),
            ],
            check=True,
            capture_output=True,
        )

    finally:
        for sf in seg_files:
            sf.unlink(missing_ok=True)
        concat_list.unlink(missing_ok=True)


# ── 6. Preview export (server-side merge, no save dialog) ─────────────────────

@app.route("/api/preview_export", methods=["POST"])
def api_preview_export():
    """
    Merge the kept regions into a temp preview MP3 and return its filename.
    Does NOT open a save dialog — the preview file is streamed back for playback.
    """
    global _current_preview
    data        = request.get_json(force=True, silent=True) or {}
    filename    = (data.get("filename") or "").strip()
    cut_regions = data.get("regions", [])
    title       = data.get("title", "preview")
    duration    = float(data.get("duration", 0))

    if not _valid_mp3(filename):
        return jsonify({"error": "Invalid filename."}), 400
    # cut_regions may be empty — preview the full audio as-is

    source = TEMP_DIR / filename
    if not source.exists():
        return jsonify({"error": "Source file not found – please re-download."}), 404

    if duration <= 0:
        duration = _probe_duration(source)

    keep_regions = _invert_regions(cut_regions, duration)
    if not keep_regions:
        return jsonify({"error": "Nothing left to keep – cuts cover the entire audio."}), 400

    # Delete any previous preview file
    if _current_preview and _valid_preview(_current_preview):
        (TEMP_DIR / _current_preview).unlink(missing_ok=True)

    preview_name = f"prev_{uuid.uuid4().hex[:16]}.mp3"
    preview_path = TEMP_DIR / preview_name

    try:
        if len(keep_regions) == 1:
            r = keep_regions[0]
            _ffmpeg_trim(source, preview_path, r["start"], r["end"])
        else:
            _ffmpeg_concat(source, preview_path, keep_regions)

        _current_preview   = preview_name
        preview_duration   = _probe_duration(preview_path)

        return jsonify({
            "preview_filename": preview_name,
            "preview_duration": preview_duration,
            "kept_segments":    len(keep_regions),
        })

    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.decode(errors="replace") if exc.stderr else "unknown"
        return jsonify({"error": f"FFmpeg error: {stderr}"}), 500
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/preview_audio/<path:filename>")
def api_preview_audio(filename: str):
    """Stream a generated preview MP3 to the browser audio player."""
    if not _valid_preview(filename):
        abort(400)
    fp = TEMP_DIR / filename
    if not fp.exists():
        abort(404)
    return send_file(fp, mimetype="audio/mpeg")


@app.route("/api/save_preview", methods=["POST"])
def api_save_preview():
    """Open folder-picker and save the already-generated preview file."""
    data             = request.get_json(force=True, silent=True) or {}
    preview_filename = (data.get("preview_filename") or "").strip()
    title            = (data.get("title") or "trimmed_audio").strip()
    custom_title     = (data.get("custom_title") or "").strip()
    if custom_title:
        title = custom_title

    if not _valid_preview(preview_filename):
        return jsonify({"error": "Invalid preview filename."}), 400

    preview_path = TEMP_DIR / preview_filename
    if not preview_path.exists():
        return jsonify({"error": "Preview file not found – please regenerate."}), 404

    save_dir = _pick_folder()
    if save_dir is None:
        return jsonify({"cancelled": True})

    stem        = _safe_name(title)
    output_path = Path(save_dir) / f"{stem}.mp3"
    counter     = 1
    while output_path.exists():
        output_path = Path(save_dir) / f"{stem}_{counter}.mp3"
        counter += 1

    try:
        import shutil
        shutil.copy2(str(preview_path), str(output_path))
        return jsonify({
            "success":  True,
            "path":     str(output_path),
            "filename": output_path.name,
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ── 7. SSE Export — real-time FFmpeg progress stream ──────────────────────────

def _ffmpeg_trim_progress(src: Path, dst: Path, start: float, end: float,
                           seg_dur: float, pct_start: int, pct_end: int):
    """Run ffmpeg trim with -progress pipe:1 and yield integer pct values."""
    proc = subprocess.Popen(
        ["ffmpeg", "-y",
         "-ss", str(start), "-to", str(end),
         "-i", str(src),
         "-acodec", "libmp3lame", "-q:a", "0",
         "-progress", "pipe:1", "-nostats",
         str(dst)],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )
    pct_range = pct_end - pct_start
    for raw in proc.stdout:
        line = raw.decode(errors="replace").strip()
        if line.startswith("out_time_ms="):
            try:
                ms = int(line.split("=", 1)[1])
                if ms >= 0:
                    ratio = min(1.0, ms / 1_000_000 / seg_dur)
                    yield pct_start + int(ratio * pct_range)
            except (ValueError, IndexError):
                pass
    proc.wait()
    yield pct_end


def _ffmpeg_concat_progress(concat_list: Path, dst: Path,
                              total_dur: float, pct_start: int, pct_end: int):
    """Run ffmpeg concat with -progress pipe:1 and yield integer pct values."""
    proc = subprocess.Popen(
        ["ffmpeg", "-y",
         "-f", "concat", "-safe", "0", "-i", str(concat_list),
         "-acodec", "libmp3lame", "-q:a", "0",
         "-progress", "pipe:1", "-nostats",
         str(dst)],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )
    pct_range = pct_end - pct_start
    for raw in proc.stdout:
        line = raw.decode(errors="replace").strip()
        if line.startswith("out_time_ms="):
            try:
                ms = int(line.split("=", 1)[1])
                if ms >= 0:
                    ratio = min(1.0, ms / 1_000_000 / max(total_dur, 0.1))
                    yield pct_start + int(ratio * pct_range)
            except (ValueError, IndexError):
                pass
    proc.wait()
    yield pct_end


@app.route("/api/export_stream", methods=["POST"])
def api_export_stream():
    """
    SSE version of /api/export.
    Streams FFmpeg progress as server-sent events so the frontend can
    show a real progress bar rather than a spinning button.

    Events emitted:
      {"type":"progress", "pct":0-100, "msg":"..."}
      {"type":"done",     "filename":"...", "path":"...", "kept_segments":N}
      {"type":"cancelled"}
      {"type":"error",    "message":"..."}
    """
    data         = request.get_json(force=True, silent=True) or {}
    filename     = (data.get("filename") or "").strip()
    cut_regions  = data.get("regions", [])
    title        = (data.get("title") or "trimmed_audio").strip()
    custom_title = (data.get("custom_title") or "").strip()
    if custom_title:
        title = custom_title
    duration = float(data.get("duration") or 0)

    def _ev(obj):
        return f"data: {json.dumps(obj)}\n\n"

    def generate():
        nonlocal duration

        # ── Validation ──────────────────────────────────────────────────────────
        if not _valid_mp3(filename):
            yield _ev({"type": "error", "message": "Invalid filename."})
            return
        # cut_regions may be empty — export the full audio as-is

        source = TEMP_DIR / filename
        if not source.exists():
            yield _ev({"type": "error", "message": "Source file not found – please re-download."})
            return

        if duration <= 0:
            duration = _probe_duration(source)

        keep_regions = _invert_regions(cut_regions, duration)
        if not keep_regions:
            yield _ev({"type": "error", "message": "Nothing left to keep — cuts cover the entire audio."})
            return

        # ── Open folder picker (blocking until user chooses) ─────────────────
        yield _ev({"type": "progress", "pct": 5, "msg": "Opening save dialog…"})

        save_dir = _pick_folder()
        if save_dir is None:
            yield _ev({"type": "cancelled"})
            return

        stem        = _safe_name(title)
        output_path = Path(save_dir) / f"{stem}.mp3"
        counter     = 1
        while output_path.exists():
            output_path = Path(save_dir) / f"{stem}_{counter}.mp3"
            counter += 1

        yield _ev({"type": "progress", "pct": 15, "msg": "Exporting…"})

        # ── FFmpeg with progress streaming ───────────────────────────────────
        try:
            n = len(keep_regions)

            if n == 1:
                r       = keep_regions[0]
                seg_dur = max(0.1, float(r["end"]) - float(r["start"]))
                for pct in _ffmpeg_trim_progress(source, output_path,
                                                  float(r["start"]), float(r["end"]),
                                                  seg_dur, 15, 97):
                    yield _ev({"type": "progress", "pct": pct, "msg": "Exporting…"})

            else:
                seg_files   = []
                concat_list = TEMP_DIR / f"{source.stem}_concat.txt"
                try:
                    for i, r in enumerate(keep_regions):
                        seg     = TEMP_DIR / f"{source.stem}_seg{i}.mp3"
                        seg_dur = max(0.1, float(r["end"]) - float(r["start"]))
                        p_start = 15 + int((i / n) * 65)
                        p_end   = 15 + int(((i + 1) / n) * 65)
                        label   = f"Segment {i + 1}/{n}…"
                        for pct in _ffmpeg_trim_progress(source, seg,
                                                          float(r["start"]), float(r["end"]),
                                                          seg_dur, p_start, p_end):
                            yield _ev({"type": "progress", "pct": pct, "msg": label})
                        seg_files.append(seg)

                    yield _ev({"type": "progress", "pct": 82, "msg": "Merging segments…"})

                    with open(concat_list, "w", encoding="utf-8") as fh:
                        for sf in seg_files:
                            fh.write(f"file '{sf.as_posix()}'\n")

                    concat_dur = sum(
                        max(0.1, float(r["end"]) - float(r["start"]))
                        for r in keep_regions
                    )
                    for pct in _ffmpeg_concat_progress(concat_list, output_path,
                                                        concat_dur, 82, 97):
                        yield _ev({"type": "progress", "pct": pct, "msg": "Merging…"})

                finally:
                    for sf in seg_files:
                        sf.unlink(missing_ok=True)
                    concat_list.unlink(missing_ok=True)

            yield _ev({
                "type":          "done",
                "filename":      output_path.name,
                "path":          str(output_path),
                "kept_segments": n,
            })

        except Exception as exc:
            yield _ev({"type": "error", "message": str(exc)})

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── 8. Cleanup temp file ───────────────────────────────────────────────────────

@app.route("/api/cleanup", methods=["POST"])
def api_cleanup():
    """Delete the temporary MP3(s) once the user is done (called by New Session)."""
    global _last_filename, _current_preview
    data             = request.get_json(force=True, silent=True) or {}
    filename         = (data.get("filename") or "").strip()
    preview_filename = (data.get("preview_filename") or "").strip()

    if _valid_mp3(filename):
        (TEMP_DIR / filename).unlink(missing_ok=True)
        if _last_filename == filename:
            _last_filename = None

    if _valid_preview(preview_filename):
        (TEMP_DIR / preview_filename).unlink(missing_ok=True)
        if _current_preview == preview_filename:
            _current_preview = None

    return jsonify({"ok": True})


# ── Entry Point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import webbrowser, time

    def _open():
        time.sleep(1.4)
        webbrowser.open("http://localhost:5000")

    threading.Thread(target=_open, daemon=True).start()

    print("\n🎵  MP3 Studio")
    print("━" * 42)
    print("🌐  Open → http://localhost:5000")
    print("━" * 42)
    print("✅  Request logs silenced (errors only)")
    print("Press Ctrl+C to stop.\n")

    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
