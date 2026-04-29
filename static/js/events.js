/**
 * events.js — All DOM event wiring, async flows (fetch / download /
 * poll / export / new-session), fullscreen handling, and keyboard shortcuts.
 *
 * Imports: state.js, regions.js, wavesurfer.js, ui.js, api.js,
 *          upload.js, constants.js.
 * No circular dependencies.
 */

import { State, History }                        from "./state.js";
import { Regions, closeAllMiniPlayers }          from "./regions.js";
import { WS, loadEditor, updateZoomUI,
         sliderToZoom, calibrateZoomScale }      from "./wavesurfer.js";
import { UI }                                    from "./ui.js";
import { API }                                   from "./api.js";
import { clearSelectedFile }                     from "./upload.js";
import { _fmtTime }                              from "./utils.js";
import { POLL_INTERVAL_MS, SKIP_SECONDS }         from "./constants.js";

/* ══════════════════════════════════════════════════════════════
   INIT  –  wire every button, slider, key, and resize event
═══════════════════════════════════════════════════════════════ */

export function initEvents() {

  // ── Theme: apply saved preference on startup ─────────────────
  UI.initTheme();

  // ── Tab switching ────────────────────────────────────────────
  document.getElementById("tab-yt-btn")    .addEventListener("click", () => UI.switchTab("yt"));
  document.getElementById("tab-upload-btn").addEventListener("click", () => UI.switchTab("upload"));

  // ── Step 1: URL input ────────────────────────────────────────
  document.getElementById("fetch-btn").addEventListener("click", handleFetch);

  document.getElementById("url-input").addEventListener("keydown", e => {
    if (e.key === "Enter") handleFetch();
  });

  document.getElementById("paste-btn").addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      document.getElementById("url-input").value = text.trim();
      handleFetch();
    } catch {
      UI.showToast("Paste failed – try Ctrl+V.", "info");
    }
  });

  document.getElementById("download-btn").addEventListener("click", handleDownload);

  // ── Step 2: Progress ─────────────────────────────────────────
  document.getElementById("cancel-btn").addEventListener("click", () => {
    clearTimeout(State.pollTimer);
    UI.showStep("step-input");
    UI.showToast("Download cancelled.", "info");
  });

  // ── Step 3: Editor — history ─────────────────────────────────
  document.getElementById("undo-btn").addEventListener("click", () => { History.undo(); UI.refreshHistoryButtons(); });
  document.getElementById("redo-btn").addEventListener("click", () => { History.redo(); UI.refreshHistoryButtons(); });

  // ── Step 3: Editor — region actions ──────────────────────────
  document.getElementById("add-region-btn").addEventListener("click", () => {
    if (!State.ws) return;
    const cur = State.ws.getCurrentTime();
    const dur = State.duration;

    // Drop a 10-second window centered on the playhead.
    // If the audio is shorter, fall back to 20 % of the duration.
    // This makes the button genuinely useful while listening:
    //   hear something to cut → press N → region appears around that moment.
    const half = Math.min(5, dur * 0.10);       // 5 s each side (≤ 10 % of total)
    const s    = Math.max(0,   cur - half);
    const e    = Math.min(dur, cur + half);

    if (e - s < 0.2) return;                    // nothing sensible to add

    const id = Regions.add(s, e);
    UI.highlightRegionInList(id);
    UI.showToast("Cut region placed at playhead — drag edges to adjust.", "info");
  });

  document.getElementById("export-btn").addEventListener("click", handleExport);

  document.getElementById("new-session-btn").addEventListener("click", handleNewSession);

  document.getElementById("reset-edits-btn").addEventListener("click", () => {
    if (State.regionMap.size === 0 && !History.canUndo()) {
      UI.showToast("Nothing to reset — no cuts made yet.", "info");
      return;
    }
    if (!confirm("Reset all cuts and undo history? The audio stays loaded.")) return;
    Regions.clearAll(false);
    History.clear();
    State.colorCycle = 0;
    UI.refreshHistoryButtons();
    UI.showToast("All edits reset. Start fresh!", "info");
  });

  document.getElementById("clear-regions-btn").addEventListener("click", () => {
    Regions.clearAll();
    UI.showToast("All cuts cleared (Ctrl+Z to undo).", "info");
  });

  // ── Step 3: Editor — playback ─────────────────────────────────
  document.getElementById("play-btn").addEventListener("click", () => WS.togglePlay());

  document.getElementById("skip-back-btn").addEventListener("click", () => WS.skip(-SKIP_SECONDS));
  document.getElementById("skip-fwd-btn") .addEventListener("click", () => WS.skip(+SKIP_SECONDS));

  document.getElementById("volume-slider").addEventListener("input", e => WS.setVolume(+e.target.value));

  // ── Playback speed slider ─────────────────────────────────────
  document.getElementById("speed-slider").addEventListener("input", e => {
    const rate = +e.target.value;
    if (State.ws) State.ws.setPlaybackRate(rate);
    _updateSpeedBadge(rate);
  });

  document.getElementById("speed-reset-btn").addEventListener("click", () => {
    document.getElementById("speed-slider").value = 1;
    if (State.ws) State.ws.setPlaybackRate(1);
    _updateSpeedBadge(1);
  });

  document.getElementById("preview-regions-btn").addEventListener("click", _generatePreview);

  // Seek bar click
  document.getElementById("seek-bar-container").addEventListener("click", e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = (e.clientX - rect.left) / rect.width;
    WS.seek(pct * State.duration);
  });

  // ── Step 3: Editor — zoom (logarithmic scale, slider pos 0–100) ──
  const zoomSlider = document.getElementById("zoom-slider");

  // Helper: apply slider position → WaveSurfer zoom + UI update
  const _applyZoom = pos => {
    const clamped = Math.max(0, Math.min(100, pos));
    zoomSlider.value = clamped;
    WS.zoom(sliderToZoom(clamped));
    updateZoomUI(clamped);
  };

  zoomSlider.addEventListener("input", () => _applyZoom(+zoomSlider.value));

  // Zoom-in / zoom-out buttons: move 6 positions on the 0-100 log scale
  // (equal steps in log space = proportional zoom changes)
  document.getElementById("zoom-in-btn").addEventListener("click",  () => _applyZoom(+zoomSlider.value + 6));
  document.getElementById("zoom-out-btn").addEventListener("click", () => _applyZoom(+zoomSlider.value - 6));

  // Fit button: reset to natural fit-to-view (outside slider range, below _zoomMin)
  document.getElementById("reset-zoom-btn").addEventListener("click", () => {
    zoomSlider.value = 0;
    WS.zoom(0);          // 0 tells WaveSurfer to fit the waveform to the container
    updateZoomUI(0);
  });

  // ── Fullscreen ────────────────────────────────────────────────
  document.getElementById("fullscreen-btn").addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", _onFullscreenChange);
  window.addEventListener("resize", () => {
    if (document.querySelector(".waveform-card")?.classList.contains("is-fullscreen")) {
      WS.fitHeight();
    }
  });

  // ── Export modal ──────────────────────────────────────────────
  document.getElementById("modal-close-btn").addEventListener("click", UI.hideExportModal);
  document.getElementById("modal-new-btn")  .addEventListener("click", () => {
    UI.hideExportModal();
    handleNewSession();
  });

  // ── Preview modal ──────────────────────────────────────────────
  document.getElementById("pv-close-btn").addEventListener("click", UI.hidePreviewModal);
  document.getElementById("pv-save-btn") .addEventListener("click", _savePreview);

  // Preview audio player controls
  _initPreviewPlayer();

  // ── Theme toggle ──────────────────────────────────────────────
  document.getElementById("theme-toggle-btn")?.addEventListener("click", () => UI.toggleTheme());

  // ── Keyboard shortcuts modal ──────────────────────────────────
  document.getElementById("shortcuts-close-btn")?.addEventListener("click", UI.hideShortcutsModal);
  document.getElementById("shortcuts-modal")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) UI.hideShortcutsModal();
  });

  // ── Session restore banner ────────────────────────────────────
  document.getElementById("session-restore-dismiss")?.addEventListener("click", UI.hideRestoreBanner);
  document.getElementById("session-clear-btn")?.addEventListener("click", () => {
    clearSession();
    UI.hideRestoreBanner();
    document.getElementById("session-clear-btn")?.classList.add("hidden");
    UI.showToast("Saved session cleared.", "info");
  });

  // ── Auto-save: triggered when regions change ──────────────────
  document.addEventListener("regions-changed", saveSession);

  // ── Session restore: triggered when WaveSurfer is ready ───────
  document.addEventListener("ws-ready", restoreSession, { once: true });

  // ── Loop region via right-click on region items ───────────────
  document.addEventListener("region-contextmenu", e => {
    _showRegionContextMenu(e.detail.id, e.detail.x, e.detail.y);
  });

  // ── Also support right-click directly on waveform regions ─────
  // WaveSurfer regions don't natively expose contextmenu, so we use
  // the region-clicked event + a right-click listener on the container
  document.getElementById("waveform-mount")?.addEventListener("contextmenu", e => {
    e.preventDefault();
    // Find which region was clicked by checking WS region positions
    if (!State.wsRegions || !State.ws) return;
    const rect    = e.currentTarget.getBoundingClientRect();
    const mouseX  = e.clientX - rect.left;
    let scroll = 0, totalW = rect.width;
    try {
      const wrap = State.ws.getWrapper();
      if (wrap) { scroll = wrap.scrollLeft; totalW = wrap.scrollWidth; }
    } catch { /* ignore */ }
    const clickTime = ((mouseX + scroll) / totalW) * State.duration;
    // Find a region that contains the clicked time
    for (const [id, data] of State.regionMap) {
      if (clickTime >= data.wsRef.start && clickTime <= data.wsRef.end) {
        _showRegionContextMenu(id, e.clientX, e.clientY);
        return;
      }
    }
  });

  // ── Close context menu on click outside ───────────────────────
  document.addEventListener("click", e => {
    const menu = document.getElementById("region-context-menu");
    if (menu && !menu.classList.contains("hidden") && !menu.contains(e.target)) {
      menu.classList.add("hidden");
    }
  });

  // ── Keyboard shortcuts ────────────────────────────────────────
  document.addEventListener("keydown", e => {
    const inInput = ["INPUT", "TEXTAREA"].includes(e.target.tagName);

    // Space → play / pause
    if (e.code === "Space" && !inInput) {
      e.preventDefault();
      WS.togglePlay();
    }

    // Ctrl+Z → undo
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      History.undo();
      UI.refreshHistoryButtons();
    }

    // Ctrl+Shift+Z or Ctrl+Y → redo
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
      e.preventDefault();
      History.redo();
      UI.refreshHistoryButtons();
    }

    // N → add region
    if (e.key === "n" && !inInput && State.ws) {
      document.getElementById("add-region-btn").click();
    }

    // P → toggle preview
    if (e.key === "p" && !inInput && State.ws) {
      document.getElementById("preview-regions-btn").click();
    }

    // Arrow keys → skip
    if (e.key === "ArrowLeft"  && !inInput && State.ws) { e.preventDefault(); WS.skip(-SKIP_SECONDS); }
    if (e.key === "ArrowRight" && !inInput && State.ws) { e.preventDefault(); WS.skip(+SKIP_SECONDS); }

    // F → fullscreen
    if (e.key === "f" && !inInput && State.ws) { e.preventDefault(); toggleFullscreen(); }

    // L → stop loop
    if (e.key === "l" && !inInput) { e.preventDefault(); _stopLoop(); }

    // ? → shortcuts overlay
    if (e.key === "?" && !inInput) { e.preventDefault(); UI.showShortcutsModal(); }

    // Escape → exit fullscreen OR close modals
    if (e.key === "Escape") {
      const card = document.querySelector(".waveform-card");
      if (card?.classList.contains("is-fullscreen") && !document.fullscreenElement) {
        _exitCSSFullscreen();
      }
      UI.hideShortcutsModal();
    }
  });
}

/* ══════════════════════════════════════════════════════════════
   FETCH FLOW  –  URL → video preview
═══════════════════════════════════════════════════════════════ */

async function handleFetch() {
  const url = document.getElementById("url-input").value.trim();
  if (!url) { UI.showToast("Please paste a YouTube URL first.", "info"); return; }

  _setFetchLoading(true);
  document.getElementById("url-error")     .classList.add("hidden");
  document.getElementById("video-preview") .classList.add("hidden");

  try {
    const info = await API.fetchInfo(url);
    if (info.error) throw new Error(info.error);

    document.getElementById("preview-thumb")         .src         = info.thumbnail;
    document.getElementById("preview-title")         .textContent = info.title;
    document.getElementById("preview-channel")       .textContent = info.channel || "—";
    document.getElementById("preview-views")         .textContent =
      info.view_count ? `${info.view_count.toLocaleString()} views` : "";
    document.getElementById("preview-duration-badge").textContent = info.duration_str;

    State.videoUrl  = url;
    State.title     = info.title;
    State.duration  = info.duration;
    State.thumbnail = info.thumbnail;
    State.channel   = info.channel;

    document.getElementById("video-preview").classList.remove("hidden");
    document.getElementById("video-preview").classList.add("slide-down");

  } catch (err) {
    const errEl = document.getElementById("url-error");
    errEl.textContent = err.message || "Could not fetch video. Check the URL.";
    errEl.classList.remove("hidden");
  } finally {
    _setFetchLoading(false);
  }
}

/* ══════════════════════════════════════════════════════════════
   DOWNLOAD FLOW  –  start download → poll → load editor
═══════════════════════════════════════════════════════════════ */

async function handleDownload() {
  UI.showStep("step-progress");
  try {
    const result = await API.startDownload(State.videoUrl);
    if (result.error) throw new Error(result.error);
    State.taskId = result.task_id;
    _startPolling(State.taskId);
  } catch (err) {
    UI.showStep("step-input");
    UI.showToast("Download failed: " + err.message, "error", 5000);
  }
}

function _startPolling(taskId) {
  clearTimeout(State.pollTimer);

  const tick = async () => {
    try {
      const status = await API.pollStatus(taskId);

      document.getElementById("progress-message").textContent = status.message || "…";
      const pct = Math.round(status.progress || 0);
      document.getElementById("progress-fill").style.width = pct + "%";
      document.getElementById("progress-pct") .textContent = pct + "%";

      if (status.status === "done") {
        State.filename = status.filename;
        State.title    = status.title    || State.title;
        State.duration = status.duration || State.duration;
        State.channel  = status.channel  || State.channel;
        await loadEditor();
        return;
      }

      if (status.status === "error") {
        UI.showStep("step-input");
        UI.showToast("Error: " + status.message, "error", 6000);
        return;
      }

      State.pollTimer = setTimeout(tick, POLL_INTERVAL_MS);

    } catch {
      // transient network error — back off and retry
      State.pollTimer = setTimeout(tick, POLL_INTERVAL_MS * 2);
    }
  };

  tick();
}

/* ══════════════════════════════════════════════════════════════
   EXPORT FLOW
═══════════════════════════════════════════════════════════════ */

async function handleExport() {
  const sorted = Regions.getSorted();
  if (!sorted.length) { UI.showToast("No regions to export.", "info"); return; }

  const btn        = document.getElementById("export-btn");
  const customName = (document.getElementById("output-filename-input")?.value || "").trim();

  btn.disabled = true;
  _setExportProgress(5, "Opening save dialog…");

  try {
    const result = await API.exportStream(
      State.filename,
      sorted.map(r => ({ start: r.start, end: r.end, label: r.label })),
      State.title,
      State.duration,
      customName,
      (pct, msg) => _setExportProgress(pct, msg),
    );

    if (result.type === "cancelled") { UI.showToast("Export cancelled.", "info"); return; }
    if (result.type === "error")     throw new Error(result.message);

    UI.showExportModal(result.filename, result.path);

  } catch (err) {
    UI.showToast("Export failed: " + err.message, "error", 5000);
  } finally {
    _resetExportBtn();
  }
}

function _setExportProgress(pct, msg) {
  const btn = document.getElementById("export-btn");
  btn.innerHTML = `
    <span class="export-pbar-wrap">
      <span class="export-pbar-fill" style="width:${pct}%"></span>
    </span>
    <span class="export-pbar-label">${msg}</span>`;
}

function _resetExportBtn() {
  const btn = document.getElementById("export-btn");
  btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2.2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg> Export MP3`;
  btn.disabled = State.regionMap.size === 0;
}

/* ══════════════════════════════════════════════════════════════
   NEW SESSION  –  tear everything down, return to step-input
═══════════════════════════════════════════════════════════════ */

export async function handleNewSession() {
  clearTimeout(State.pollTimer);

  // Stop any active loop
  _stopLoop();

  // Close all region mini-players
  closeAllMiniPlayers();

  // Close preview modal and stop audio if open
  if (State.previewActive) UI.hidePreviewModal();
  if (State.ws) { State.ws.destroy(); State.ws = null; }

  // Clean up temp files on server (source MP3 + any preview MP3)
  if (State.filename) {
    API.cleanup(State.filename, State.currentPreviewFile).catch(() => {});
    State.filename          = null;
    State.currentPreviewFile = null;
  }

  // Reset state
  State.taskId    = null;
  State.title     = "";
  State.duration  = 0;
  State.thumbnail = "";
  State.channel   = "";
  State.videoUrl  = "";
  State.regionMap.clear();
  State.colorCycle = 0;
  History.clear();

  // Reset playback speed to 1×
  const speedSlider = document.getElementById("speed-slider");
  if (speedSlider) { speedSlider.value = 1; _updateSpeedBadge(1); }

  // Reset UI inputs
  document.getElementById("url-input")   .value = "";
  document.getElementById("video-preview").classList.add("hidden");
  document.getElementById("url-error")   .classList.add("hidden");
  document.getElementById("file-preview") .classList.add("hidden");
  document.getElementById("upload-error") .classList.add("hidden");
  document.getElementById("file-input")  .value = "";
  clearSelectedFile();

  // Reset regions panel
  document.getElementById("regions-list") .innerHTML = "";
  document.getElementById("regions-count").textContent = "0";
  document.getElementById("regions-empty").classList.remove("hidden");

  // Reset zoom slider to 0 (fit to view)
  const zs = document.getElementById("zoom-slider");
  if (zs) { zs.value = 0; updateZoomUI(0); }
  if (State.ws) WS.zoom(0);

  // Reset time displays
  const phEl = document.getElementById("wf-playhead-time");
  if (phEl) phEl.textContent = "0:00.000";

  // Re-register the one-time ws-ready listener for the next session
  document.addEventListener("ws-ready", restoreSession, { once: true });

  UI.hideRestoreBanner();
  document.getElementById("session-clear-btn")?.classList.add("hidden");
  UI.updateExportButton();
  UI.refreshHistoryButtons();
  UI.switchTab("yt");
  UI.showStep("step-input");
}

/* ══════════════════════════════════════════════════════════════
   FULLSCREEN  –  CSS-class-based (no browser fullscreen API)
═══════════════════════════════════════════════════════════════ */

function toggleFullscreen() {
  const card = document.querySelector(".waveform-card");
  if (!card) return;
  card.classList.contains("is-fullscreen") ? _exitCSSFullscreen() : _enterCSSFullscreen();
}

function _enterCSSFullscreen() {
  const card = document.querySelector(".waveform-card");
  card.classList.add("is-fullscreen");
  document.body.style.overflow = "hidden";
  document.getElementById("fs-expand-icon")  .classList.add("hidden");
  document.getElementById("fs-collapse-icon").classList.remove("hidden");
  document.getElementById("fullscreen-btn").title = "Exit fullscreen (F or Esc)";
  setTimeout(() => WS.fitHeight(), 50);
}

function _exitCSSFullscreen() {
  const card = document.querySelector(".waveform-card");
  card.classList.remove("is-fullscreen");
  document.body.style.overflow = "";
  document.getElementById("fs-expand-icon")  .classList.remove("hidden");
  document.getElementById("fs-collapse-icon").classList.add("hidden");
  document.getElementById("fullscreen-btn").title = "Fullscreen waveform (F)";
  setTimeout(() => WS.fitHeight(), 50);
}

function _onFullscreenChange() {
  // Sync CSS-class state when the browser's native fullscreen exits (e.g. Escape)
  if (!document.fullscreenElement) {
    const card = document.querySelector(".waveform-card");
    if (card?.classList.contains("is-fullscreen")) _exitCSSFullscreen();
  }
}

/* ══════════════════════════════════════════════════════════════
   PREVIEW FLOW  –  generate merged audio → show modal player
═══════════════════════════════════════════════════════════════ */

async function _generatePreview() {
  const sorted = Regions.getSorted();
  if (!sorted.length) {
    UI.showToast("Add at least one cut region first.", "info");
    return;
  }

  const btn = document.getElementById("preview-regions-btn");
  btn.disabled = true;
  btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2.2" class="spin-icon">
      <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="10"/>
    </svg> Generating…`;

  try {
    const result = await API.previewExport(
      State.filename,
      sorted.map(r => ({ start: r.start, end: r.end })),
      State.title,
      State.duration,
    );

    if (result.error) throw new Error(result.error);

    UI.showPreviewModal(
      `/api/preview_audio/${result.preview_filename}`,
      result.preview_filename,
      result.preview_duration,
      result.kept_segments,
    );

  } catch (err) {
    UI.showToast("Preview failed: " + err.message, "error", 5000);
  } finally {
    btn.disabled  = false;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.2">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg> Preview`;
  }
}

async function _savePreview() {
  if (!State.currentPreviewFile) return;

  const btn     = document.getElementById("pv-save-btn");
  btn.disabled  = true;
  btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2.2" class="spin-icon">
    <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="10"/>
  </svg> Saving…`;

  try {
    const customName = (document.getElementById("output-filename-input")?.value || "").trim();
    const result = await API.savePreview(State.currentPreviewFile, State.title, customName);

    if (result.cancelled) {
      UI.showToast("Save cancelled.", "info");
      return;
    }
    if (result.error) throw new Error(result.error);

    UI.hidePreviewModal();
    UI.showExportModal(result.filename, result.path);

  } catch (err) {
    UI.showToast("Save failed: " + err.message, "error", 5000);
  } finally {
    btn.disabled  = false;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg> Save MP3`;
  }
}

/** Wire up the HTML5 audio element controls inside the preview modal. */
function _initPreviewPlayer() {
  const audio       = document.getElementById("preview-audio");
  const playBtn     = document.getElementById("pv-play-btn");
  const playIcon    = document.getElementById("pv-play-icon");
  const pauseIcon   = document.getElementById("pv-pause-icon");
  const seekBar     = document.getElementById("pv-seek-bar");
  const seekFill    = document.getElementById("pv-seek-progress");
  const timeCurrent = document.getElementById("pv-time-current");

  playBtn.addEventListener("click", () => {
    audio.paused ? audio.play() : audio.pause();
  });

  audio.addEventListener("play", () => {
    playIcon .classList.add("hidden");
    pauseIcon.classList.remove("hidden");
  });
  audio.addEventListener("pause", () => {
    playIcon .classList.remove("hidden");
    pauseIcon.classList.add("hidden");
  });
  audio.addEventListener("ended", () => {
    playIcon .classList.remove("hidden");
    pauseIcon.classList.add("hidden");
    seekFill.style.width        = "100%";
  });

  audio.addEventListener("timeupdate", () => {
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    seekFill.style.width   = pct + "%";
    timeCurrent.textContent = _fmtTime(audio.currentTime);
  });

  // Click or drag on seek bar to jump
  seekBar.addEventListener("click", e => {
    if (!audio.duration) return;
    const rect = seekBar.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  });

  // Also allow keyboard on the seek bar
  seekBar.addEventListener("keydown", e => {
    if (!audio.duration) return;
    if (e.key === "ArrowLeft")  audio.currentTime = Math.max(0, audio.currentTime - 5);
    if (e.key === "ArrowRight") audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
  });
}

/* ══════════════════════════════════════════════════════════════
   SESSION AUTO-SAVE  —  localStorage keyed by audio filename
═══════════════════════════════════════════════════════════════ */

function _sessionKey() {
  return State.filename ? `mp3studio:session:${State.filename}` : null;
}

function saveSession() {
  const key = _sessionKey();
  if (!key) return;
  const regions = Regions.getSorted().map(r => ({
    id:       r.id,
    start:    r.start,
    end:      r.end,
    colorIdx: r.colorIdx,
    label:    r.label,
  }));
  const clearBtn = document.getElementById("session-clear-btn");
  if (regions.length === 0) {
    localStorage.removeItem(key);
    clearBtn?.classList.add("hidden");
  } else {
    localStorage.setItem(key, JSON.stringify({ regions, savedAt: Date.now() }));
    clearBtn?.classList.remove("hidden");
  }
}

function restoreSession() {
  const key = _sessionKey();
  if (!key) return;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const { regions } = JSON.parse(raw);
    if (!Array.isArray(regions) || regions.length === 0) return;

    // Replay each saved region without adding to undo history
    regions.forEach(r => Regions._create(r.id, r.start, r.end, r.colorIdx, r.label, false));
    History.clear();
    UI.refreshHistoryButtons();
    UI.updateExportButton();
    UI.showRestoreBanner(regions.length);
    // Show the clear-saved button
    document.getElementById("session-clear-btn")?.classList.remove("hidden");
  } catch { /* malformed localStorage data — ignore */ }
}

function clearSession() {
  const key = _sessionKey();
  if (key) localStorage.removeItem(key);
}

/* ══════════════════════════════════════════════════════════════
   LOOP REGION  —  right-click context menu + loop playback
═══════════════════════════════════════════════════════════════ */

function _showRegionContextMenu(regionId, x, y) {
  const menu = document.getElementById("region-context-menu");
  if (!menu) return;

  // Position the menu
  menu.style.left = x + "px";
  menu.style.top  = y + "px";
  menu.classList.remove("hidden");

  // Wire buttons
  const loopBtn   = menu.querySelector(".ctx-loop-btn");
  const removeBtn = menu.querySelector(".ctx-remove-btn");

  const freshLoop = loopBtn.cloneNode(true);
  const freshRem  = removeBtn.cloneNode(true);
  loopBtn.replaceWith(freshLoop);
  removeBtn.replaceWith(freshRem);

  freshLoop.addEventListener("click", () => {
    menu.classList.add("hidden");
    _startLoop(regionId);
  });
  freshRem.addEventListener("click", () => {
    menu.classList.add("hidden");
    Regions.remove(regionId);
    UI.showToast("Cut removed (Ctrl+Z to undo)", "info");
  });
}

function _startLoop(regionId) {
  const data = State.regionMap.get(regionId);
  if (!data || !State.ws) return;

  _stopLoop(); // stop any existing loop first

  State.loopActive   = true;
  State.loopRegionId = regionId;

  State.ws.setTime(data.wsRef.start);
  State.ws.play();

  UI.showToast("Looping region — press L to stop", "info", 4000);

  // Watch playback position and loop back when we hit the end
  const _tick = () => {
    if (!State.loopActive) return;
    const d = State.regionMap.get(State.loopRegionId);
    if (!d || !State.ws) { _stopLoop(); return; }

    if (State.ws.getCurrentTime() >= d.wsRef.end - 0.05) {
      State.ws.setTime(d.wsRef.start);
      State.ws.play();
    }
    State._loopRAF = requestAnimationFrame(_tick);
  };
  State._loopRAF = requestAnimationFrame(_tick);
}

function _stopLoop() {
  if (!State.loopActive) return;
  State.loopActive   = false;
  State.loopRegionId = null;
  cancelAnimationFrame(State._loopRAF);
  State._loopRAF = null;
}

/* ══════════════════════════════════════════════════════════════
   PRIVATE HELPERS
═══════════════════════════════════════════════════════════════ */

function _setFetchLoading(on) {
  const btn   = document.getElementById("fetch-btn");
  btn.disabled    = on;
  btn.textContent = on ? "Fetching…" : "Fetch";
}

function _updateSpeedBadge(rate) {
  const badge = document.getElementById("speed-reset-btn");
  if (!badge) return;
  // Format: "1×", "0.5×", "1.5×" — strip unnecessary trailing zero for cleanliness
  const label = (rate % 1 === 0) ? `${rate}×` : `${rate.toFixed(2).replace(/0$/, "")}×`;
  badge.textContent = label;
  // Highlight when not at 1× so the user knows speed is altered
  badge.classList.toggle("speed-badge--active", rate !== 1);
}
