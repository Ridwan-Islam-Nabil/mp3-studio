/**
 * ui.js — generic DOM helpers: step navigation, toasts, modals,
 * playback controls, editor metadata, and tab switching.
 *
 * Does NOT handle region list rendering (that lives in regions.js,
 * where it belongs alongside Regions data and event wiring).
 *
 * Imports: state.js, utils.js  —  no circular dependencies.
 */

import { State, History } from "./state.js";
import { _fmtTime, _fmtTimeMs } from "./utils.js";

export const UI = {

  /* ── Step navigation ──────────────────────────────────────── */

  /** Show the named .step section and hide all others */
  showStep(id) {
    document.querySelectorAll(".step").forEach(s => s.classList.remove("active"));
    const el = document.getElementById(id);
    if (el) { el.classList.add("active"); el.classList.remove("hidden"); }
  },

  /* ── Toast ────────────────────────────────────────────────── */

  showToast(msg, type = "info", duration = 3500) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.className   = `toast toast-${type} show`;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), duration);
  },

  /* ── Playback controls ────────────────────────────────────── */

  setPreviewMode(active) {
    const btn = document.getElementById("preview-regions-btn");
    if (active) {
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16"/>
          <rect x="14" y="4" width="4" height="16"/>
        </svg> Stop Preview`;
      btn.classList.replace("btn-secondary", "btn-primary");
    } else {
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg> Preview`;
      btn.classList.replace("btn-primary", "btn-secondary");
    }
  },

  setPlayIcon(playing) {
    document.getElementById("play-icon") .classList.toggle("hidden",  playing);
    document.getElementById("pause-icon").classList.toggle("hidden", !playing);
  },

  updateSeekBar(current, total) {
    const pct = total > 0 ? (current / total) * 100 : 0;
    document.getElementById("seek-progress").style.width = pct + "%";
    document.getElementById("time-current").textContent  = _fmtTime(current);
  },

  /* ── History buttons ──────────────────────────────────────── */

  refreshHistoryButtons() {
    document.getElementById("undo-btn").disabled = !History.canUndo();
    document.getElementById("redo-btn").disabled = !History.canRedo();
  },

  /* ── Export / region count button ────────────────────────── */

  updateExportButton() {
    const hasAudio   = !!State.filename;   // audio loaded → always enable export + preview
    const hasRegions = State.regionMap.size > 0;
    document.getElementById("export-btn").disabled          = !hasAudio;
    document.getElementById("preview-regions-btn").disabled = !hasAudio;
    document.getElementById("clear-regions-btn").style.display = hasRegions ? "inline-flex" : "none";
  },

  /* ── Region list highlighting ─────────────────────────────── */

  highlightRegionInList(id, scroll = true) {
    document.querySelectorAll(".region-item").forEach(el => {
      el.classList.toggle("active",   el.dataset.id === id);
      el.classList.toggle("playing",  el.dataset.id === id && State.previewActive);
    });
    if (id && scroll) {
      document.querySelector(`.region-item[data-id="${id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  },

  /* ── Export success modal ─────────────────────────────────── */

  showExportModal(filename, path) {
    document.getElementById("modal-body").textContent =
      `Saved as "${filename}" to:\n${path}`;
    document.getElementById("export-modal").classList.remove("hidden");
  },

  hideExportModal() {
    document.getElementById("export-modal").classList.add("hidden");
  },

  /* ── Preview modal ────────────────────────────────────────── */

  /**
   * Open the preview modal.
   * @param {string} audioUrl        – URL to stream the merged preview MP3
   * @param {string} previewFile     – "prev_xxx.mp3" (stored in State for save)
   * @param {number} previewDuration – duration in seconds of the merged preview
   * @param {number} keptSegments    – how many kept segments were merged
   */
  showPreviewModal(audioUrl, previewFile, previewDuration, keptSegments) {
    State.currentPreviewFile = previewFile;
    State.previewActive      = true;

    // Populate track info
    document.getElementById("pv-track-title").textContent   = State.title || "Audio";
    document.getElementById("pv-track-channel").textContent = State.channel || "";
    document.getElementById("pv-segments-badge").textContent =
      `${keptSegments} segment${keptSegments !== 1 ? "s" : ""} kept`;
    document.getElementById("pv-duration-badge").textContent = _fmtTime(previewDuration);

    // Reset player state
    document.getElementById("pv-seek-progress").style.width = "0%";
    document.getElementById("pv-time-current").textContent  = "0:00";
    document.getElementById("pv-time-total").textContent    = _fmtTime(previewDuration);
    document.getElementById("pv-play-icon") .classList.remove("hidden");
    document.getElementById("pv-pause-icon").classList.add("hidden");

    // Load audio
    const audio  = document.getElementById("preview-audio");
    audio.src    = audioUrl;
    audio.load();
    audio.play().catch(() => {});   // autoplay (user gesture already happened)

    document.getElementById("preview-modal").classList.remove("hidden");
  },

  hidePreviewModal() {
    const audio = document.getElementById("preview-audio");
    if (audio) { audio.pause(); audio.src = ""; }
    State.currentPreviewFile = null;
    State.previewActive      = false;
    // Reset play icon so it's clean next time
    document.getElementById("pv-play-icon") ?.classList.remove("hidden");
    document.getElementById("pv-pause-icon")?.classList.add("hidden");
    document.getElementById("preview-modal").classList.add("hidden");
  },

  /* ── Editor metadata ──────────────────────────────────────── */

  setEditorMeta(title, channel, thumbnail, duration) {
    document.getElementById("editor-title").textContent   = title;
    document.getElementById("editor-channel").textContent = channel;
    document.getElementById("editor-thumb").src           = thumbnail;
    document.getElementById("time-total").textContent     = _fmtTime(duration);
    const phEl = document.getElementById("wf-playhead-time");
    if (phEl) phEl.textContent = "0:00.000";
    // Pre-fill output filename with track title
    const fnEl = document.getElementById("output-filename-input");
    if (fnEl) fnEl.value = title;
  },

  /* ── Keyboard shortcuts modal ─────────────────────────────── */

  showShortcutsModal() {
    document.getElementById("shortcuts-modal")?.classList.remove("hidden");
  },
  hideShortcutsModal() {
    document.getElementById("shortcuts-modal")?.classList.add("hidden");
  },

  /* ── Theme toggle ─────────────────────────────────────────── */

  applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("mp3studio:theme", theme);
    const btn = document.getElementById("theme-toggle-btn");
    if (!btn) return;
    const isDark = theme === "dark";
    btn.title = isDark ? "Switch to light mode" : "Switch to dark mode";
    btn.querySelector(".theme-icon-dark") ?.classList.toggle("hidden", !isDark);
    btn.querySelector(".theme-icon-light")?.classList.toggle("hidden",  isDark);
  },

  initTheme() {
    const saved = localStorage.getItem("mp3studio:theme") || "dark";
    UI.applyTheme(saved);
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    UI.applyTheme(current === "dark" ? "light" : "dark");
  },

  /* ── Session restore banner ───────────────────────────────── */

  showRestoreBanner(regionCount) {
    const banner = document.getElementById("session-restore-banner");
    if (!banner) return;
    const msg = banner.querySelector(".restore-msg");
    if (msg) msg.textContent =
      `${regionCount} saved cut${regionCount !== 1 ? "s" : ""} restored from your last session.`;
    banner.classList.remove("hidden");
  },
  hideRestoreBanner() {
    document.getElementById("session-restore-banner")?.classList.add("hidden");
  },

  /* ── Source-tab switching ─────────────────────────────────── */

  switchTab(name) {
    ["yt", "upload"].forEach(t => {
      const btn  = document.getElementById(`tab-${t}-btn`);
      const pane = document.getElementById(`tab-${t}`);
      if (!btn || !pane) return;
      btn.classList.toggle("active", t === name);
      btn.setAttribute("aria-selected", String(t === name));
      pane.classList.toggle("hidden",  t !== name);
      pane.classList.toggle("active",  t === name);
    });
  },
};
