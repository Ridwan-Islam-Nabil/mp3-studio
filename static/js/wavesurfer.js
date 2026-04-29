/**
 * wavesurfer.js — WaveSurfer lifecycle, Preview sequential playback,
 * waveform hover cursor, zoom slider UI, and the shared loadEditor() helper.
 *
 * Imports: state.js, regions.js, ui.js, utils.js, constants.js, WaveSurfer CDN.
 * regions.js does NOT import this file → no circular dependencies.
 */

import WaveSurfer     from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js";
import RegionsPlugin  from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/plugins/regions.esm.js";
import TimelinePlugin from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/plugins/timeline.esm.js";
import MinimapPlugin  from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/plugins/minimap.esm.js";

import { State, History }               from "./state.js";
import { Regions, renderRegionsList }   from "./regions.js";
import { UI }                           from "./ui.js";
import { _fmtTimeMs, _niceInterval }    from "./utils.js";
import { REGION_PALETTE }               from "./constants.js";

/* ══════════════════════════════════════════════════════════════
   WS  –  WaveSurfer controller
═══════════════════════════════════════════════════════════════ */

export const WS = {

  init(audioUrl) {
    if (State.ws) { State.ws.destroy(); State.ws = null; }

    const timeline = TimelinePlugin.create({
      container:        "#timeline-mount",
      height:           22,
      timeInterval:     _niceInterval(State.duration),
      primaryColor:     "#475569",
      secondaryColor:   "#334155",
      primaryFontColor: "#94a3b8",
      style: { fontSize: "11px", fontFamily: "'JetBrains Mono', monospace" },
    });

    const wsRegionsPlugin = RegionsPlugin.create();
    State.wsRegions = wsRegionsPlugin;

    const minimap = MinimapPlugin.create({
      container:     "#minimap-mount",
      height:        46,
      waveColor:     ["rgba(124,58,237,.55)", "rgba(29,78,216,.55)"],
      progressColor: ["rgba(167,139,250,.8)", "rgba(96,165,250,.8)"],
      cursorColor:   "rgba(255,255,255,.7)",
      cursorWidth:   1,
      interact:      true,
      overlayColor:  "rgba(124,58,237,.12)",
    });

    const ws = WaveSurfer.create({
      container:     "#waveform-mount",
      waveColor:     ["#7c3aed", "#1d4ed8"],
      progressColor: ["#a78bfa", "#60a5fa"],
      cursorColor:   "#fff",
      cursorWidth:   2,
      height:        360,
      barWidth:      2,
      barGap:        1,
      barRadius:     2,
      normalize:     true,
      url:           audioUrl,
      plugins:       [timeline, wsRegionsPlugin, minimap],
    });

    State.ws = ws;

    // ── Playback events ────────────────────────────────────────
    ws.on("ready", () => {
      UI.showStep("step-editor");
      UI.showToast("Audio loaded — start adding regions!", "success");
      // Calibrate zoom scale based on actual container width + audio duration
      calibrateZoomScale();
      // Enable export + preview now that audio is loaded (no cuts required)
      UI.updateExportButton();
      // Notify events.js so it can restore any saved session for this file
      document.dispatchEvent(new CustomEvent("ws-ready"));
    });

    ws.on("timeupdate", t => {
      UI.updateSeekBar(t, State.duration);
      const el = document.getElementById("wf-playhead-time");
      if (el) el.textContent = _fmtTimeMs(t);
    });

    ws.on("play",   () => { State.isPlaying = true;  UI.setPlayIcon(true);  });
    ws.on("pause",  () => { State.isPlaying = false; UI.setPlayIcon(false); });
    ws.on("finish", () => { State.isPlaying = false; UI.setPlayIcon(false); });
    ws.on("error",  err => UI.showToast("Audio error: " + err, "error"));

    // ── Timeline scroll-sync ───────────────────────────────────
    // Keep the top ruler in sync with waveform pan when zoomed in.
    // WaveSurfer v7 emits 'scroll' with (scrollLeft, scrollWidth).
    ws.on("scroll", (scrollLeft) => {
      const tl = document.getElementById("timeline-mount");
      if (tl) tl.scrollLeft = scrollLeft;
    });

    // ── Region events ──────────────────────────────────────────

    // User drags to create a new cut region
    wsRegionsPlugin.on("region-created", region => {
      if (State.regionMap.has(region.id)) return; // created programmatically — skip

      const colorIdx = State.colorCycle++ % REGION_PALETTE.length;
      const label    = `Cut ${State.regionMap.size + 1}`;
      region.setOptions({ color: REGION_PALETTE[colorIdx].bg });

      State.regionMap.set(region.id, {
        wsRef: region,
        start: region.start,
        end:   region.end,
        colorIdx,
        label,
      });

      History.push({
        undo: () => Regions._remove(region.id, false),
        redo: () => {
          const d = State.regionMap.get(region.id);
          if (d) d.wsRef.setOptions({});
        },
      });
      UI.refreshHistoryButtons();
      renderRegionsList();
      UI.updateExportButton();
    });

    wsRegionsPlugin.on("region-updated",        region    => Regions.onUpdated(region.id));
    wsRegionsPlugin.on("region-double-clicked", region    => {
      Regions.remove(region.id);
      UI.showToast("Cut removed (Ctrl+Z to undo)", "info");
    });
    wsRegionsPlugin.on("region-clicked",        (region, e) => {
      e.stopPropagation();
      UI.highlightRegionInList(region.id, false);
    });

    // Enable drag-to-create on the waveform canvas
    wsRegionsPlugin.enableDragSelection({ color: REGION_PALETTE[0].bg });
  },

  togglePlay()      { State.ws?.playPause(); },
  seek(t)           { if (State.ws) State.ws.setTime(Math.max(0, Math.min(t, State.duration))); },
  setVolume(v)      { State.ws?.setVolume(v); },
  zoom(pxPerSec)    { State.ws?.zoom(pxPerSec); },
  skip(delta)       { if (State.ws) WS.seek(State.ws.getCurrentTime() + delta); },

  /** Resize the WaveSurfer canvas to fill available space */
  fitHeight() {
    if (!State.ws) return;
    const isFS = document.querySelector(".waveform-card")?.classList.contains("is-fullscreen");
    const newH = isFS ? Math.max(400, window.innerHeight - 160) : 360;
    document.getElementById("waveform-mount").style.minHeight = newH + "px";
    State.ws.setOptions({ height: newH });
  },
};

/* ══════════════════════════════════════════════════════════════
   PREVIEW  –  sequential kept-region playback
═══════════════════════════════════════════════════════════════ */

export const Preview = {
  async start() {
    const sorted = Regions.getSorted();
    if (!sorted.length) { UI.showToast("Add at least one region first.", "info"); return; }
    if (!State.ws) return;

    State.previewActive = true;
    State.previewAbort  = new AbortController();
    const signal = State.previewAbort.signal;
    UI.setPreviewMode(true);

    try {
      for (const region of sorted) {
        if (signal.aborted) break;
        State.activeRegionId = region.id;
        UI.highlightRegionInList(region.id, true);
        State.ws.setTime(region.start);
        State.ws.play();
        await Preview._waitUntil(region.end, signal);
        State.ws.pause();
        await Preview._sleep(120, signal);
      }
    } catch { /* aborted — swallow */ }
    finally {
      State.previewActive  = false;
      State.activeRegionId = null;
      UI.setPreviewMode(false);
      UI.highlightRegionInList(null, false);
    }
  },

  stop() {
    State.previewAbort?.abort();
    State.ws?.pause();
  },

  _waitUntil(targetTime, signal) {
    return new Promise((resolve, reject) => {
      const tick = () => {
        if (signal.aborted)                          return reject(new DOMException("Aborted", "AbortError"));
        if (State.ws.getCurrentTime() >= targetTime) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  },

  _sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => { clearTimeout(t); reject(); }, { once: true });
    });
  },
};

/* ══════════════════════════════════════════════════════════════
   WAVEFORM HOVER CURSOR
═══════════════════════════════════════════════════════════════ */

/**
 * Wire up the hover time cursor overlay on the waveform.
 * Shows a vertical line + time badge that follows the mouse,
 * accounting for WaveSurfer's internal scroll when zoomed.
 */
export function initWaveformCursor() {
  const mount     = document.getElementById("waveform-mount");
  const cursor    = document.getElementById("wf-hover-cursor");
  const badge     = document.getElementById("wf-hover-badge");
  const curTimeEl = document.getElementById("wf-cursor-time");
  if (!mount || !cursor || !badge) return;

  mount.addEventListener("mousemove", e => {
    if (!State.ws || !State.duration) { cursor.classList.add("hidden"); return; }

    const rect   = mount.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    // Account for WaveSurfer's internal scroll when zoomed in
    let scrollLeft = 0, totalWidth = rect.width;
    try {
      const wrapper = State.ws.getWrapper();
      if (wrapper) { scrollLeft = wrapper.scrollLeft; totalWidth = wrapper.scrollWidth; }
    } catch { /* wrapper unavailable */ }

    const progress = Math.min(1, Math.max(0, (mouseX + scrollLeft) / totalWidth));
    const timeStr  = _fmtTimeMs(progress * State.duration);

    cursor.style.left   = mouseX + "px";
    cursor.style.height = rect.height + "px";
    cursor.classList.remove("hidden");

    badge.textContent  = timeStr;
    badge.style.transform = mouseX > rect.width - 95
      ? "translateX(calc(-100% - 10px))"
      : "translateX(8px)";

    if (curTimeEl) curTimeEl.textContent = timeStr;
  });

  mount.addEventListener("mouseleave", () => {
    cursor.classList.add("hidden");
    if (curTimeEl) curTimeEl.textContent = "—";
  });
}

/* ══════════════════════════════════════════════════════════════
   ZOOM UI  –  logarithmic slider ↔ zoom conversion + UI update
═══════════════════════════════════════════════════════════════ */

const _ZOOM_MAX = 2000;

/**
 * Dynamic minimum zoom — set after audio loads based on container width
 * and audio duration. Ensures position 0 on the slider is always the
 * "just starts to zoom" point regardless of audio length.
 *
 * For a 60s audio in a 1400px container: naturalFit ≈ 23 px/sec,
 * so _zoomMin is set to ~24 and the entire slider is visually useful.
 */
let _zoomMin = 1;

/**
 * Called once when audio is ready. Computes the natural "fit to view"
 * pixels-per-second and sets it as the slider's minimum zoom.
 */
export function calibrateZoomScale() {
  const wfEl = document.getElementById("waveform-mount");
  if (!wfEl || !State.duration) return;
  // px/sec needed to exactly fill the container — anything below this
  // is visually identical to "fit to view", so start just above it
  const naturalFit = wfEl.offsetWidth / State.duration;
  _zoomMin = Math.max(1, Math.ceil(naturalFit) + 1);
}

/**
 * Convert a slider position (0–100) → actual zoom px/sec (log scale).
 *   s=0   → _zoomMin  (just above fit-to-view, always visually zoomed)
 *   s=50  → geometric midpoint between _zoomMin and 2000
 *   s=100 → 2000
 */
export function sliderToZoom(s) {
  const logMin = Math.log(_zoomMin);
  const logMax = Math.log(_ZOOM_MAX);
  return Math.round(Math.exp(logMin + (s / 100) * (logMax - logMin)));
}

/**
 * Convert an actual zoom value → slider position (0–100).
 */
export function zoomToSlider(z) {
  const logMin  = Math.log(_zoomMin);
  const logMax  = Math.log(_ZOOM_MAX);
  const clamped = Math.max(_zoomMin, Math.min(_ZOOM_MAX, z));
  return ((Math.log(clamped) - logMin) / (logMax - logMin)) * 100;
}

/**
 * Paint the slider gradient and update the zoom badge.
 * @param {number} sliderPos  – current slider value (0–100)
 */
export function updateZoomUI(sliderPos) {
  const slider = document.getElementById("zoom-slider");
  if (!slider) return;

  slider.style.background = `linear-gradient(90deg,
    var(--primary) 0%, var(--accent) ${sliderPos}%,
    rgba(255,255,255,.12) ${sliderPos}%, rgba(255,255,255,.12) 100%)`;

  const zoom  = sliderToZoom(sliderPos);
  const badge = document.getElementById("zoom-level-badge");
  if (badge) badge.textContent = zoom >= 1000
    ? `${(zoom / 1000).toFixed(1)}k×`
    : `${zoom}×`;
}

/* ══════════════════════════════════════════════════════════════
   LOAD EDITOR  –  shared entry point for download + upload flows
═══════════════════════════════════════════════════════════════ */

/**
 * Prepare the editor state and initialise WaveSurfer.
 * Called by both the YouTube download flow and the file upload flow.
 */
export async function loadEditor() {
  UI.setEditorMeta(State.title, State.channel, State.thumbnail, State.duration);
  Regions.clearAll(false);
  History.clear();
  UI.refreshHistoryButtons();
  State.colorCycle = 0;
  WS.init(`/api/audio/${State.filename}`);
}
