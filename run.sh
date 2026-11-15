#!/usr/bin/env bash
set -e

echo ""
echo " ============================================"
echo "  MP3 Studio"
echo " ============================================"
echo ""

# Check Python
if ! command -v python3 &>/dev/null; then
  echo " [ERROR] python3 is not installed."
  exit 1
fi

# Check FFmpeg
if ! command -v ffmpeg &>/dev/null; then
  echo " [WARNING] ffmpeg not found. Export will not work."
  echo " Install with: sudo apt install ffmpeg  (or brew install ffmpeg on macOS)"
  echo ""
fi

# Install dependencies (anything missing). Needs no network when everything is
# already installed, so the app still starts offline.
echo " Installing dependencies..."
python3 -m pip install -r requirements.txt -q --disable-pip-version-check

# Keep yt-dlp current — YouTube changes often break older versions.
# Best effort: short timeout, no retries, never stops the launch when offline.
echo " Updating yt-dlp..."
if python3 -m pip install -U yt-dlp -q --disable-pip-version-check --timeout 5 --retries 0 >/dev/null 2>&1; then
  echo " yt-dlp update check done (skipped if offline)."
else
  echo " [WARNING] Could not update yt-dlp — continuing with the installed version."
fi

echo ""
echo " Starting server → http://localhost:5000"
echo " Press Ctrl+C to stop."
echo ""

python3 app.py
