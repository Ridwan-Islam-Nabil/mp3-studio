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

# Install dependencies
echo " Installing dependencies..."
pip3 install -r requirements.txt -q --upgrade

echo ""
echo " Starting server → http://localhost:5000"
echo " Press Ctrl+C to stop."
echo ""

python3 app.py
