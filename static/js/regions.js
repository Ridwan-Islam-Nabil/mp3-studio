/**
 * regions.js — Regions CRUD, region list rendering, and precision time editor.
 *
 * renderRegionsList and openTimeEditor live here (not ui.js) because
 * they are tightly coupled to region data and events.
 *
 * KEY: seek calls use State.ws?.setTime() directly — this keeps regions.js
 * free of any import from wavesurfer.js, eliminating circular dependencies.
 *
 * Imports: state.js, ui.js, constants.js, utils.js  — no circular deps.
 */

import { State, History } from "./state.js";
import { UI } from "./ui.js";
import { REGION_PALETTE } from "./constants.js";
import { _fmtTime, _parseTime, escHtml } from "./utils.js";

/* ══════════════════════════════════════════════════════════════
   REGIONS  –  CRUD
═══════════════════════════════════════════════════════════════ */

export const Regions = {

  /**
   * Internal: register a WaveSurfer region in our map (and optionally
   * create the WS region if it does not already exist).
   */
  _create(id, start, end, colorIdx, label, addToHistory = true) {
    if (!State.wsRegions) return null;
    const palette = REGION_PALETTE[colorIdx % REGION_PALETTE.length];
    const region  = State.wsRegions.addRegion({
      id, start, end,
      color:  palette.bg,
      drag:   true,
      resize: true,
    });

    State.regionMap.set(id, { wsRef: region, start, end, colorIdx, label });

    if (addToHistory) {
      History.push({
        undo: () => Regions._remove(id, false),
        redo: () => Regions._create(id, start, end, colorIdx, label, false),
      });
      UI.refreshHistoryButtons();
    }

    renderRegionsList();
    UI.updateExportButton();
    return region;
  },

  /** Internal: remove a region from the map and from WaveSurfer */
  _remove(id, addToHistory = true) {
    const data = State.regionMap.get(id);
    if (!data) return;

    const snap = {
      id,
      start:    data.wsRef.start,
      end:      data.wsRef.end,
      colorIdx: data.colorIdx,
      label:    data.label,
    };

    data.wsRef.remove();
    State.regionMap.delete(id);

    if (addToHistory) {
      History.push({
        undo: () => Regions._create(snap.id, snap.start, snap.end, snap.colorIdx, snap.label, false),
        redo: () => Regions._remove(snap.id, false),
      });
      UI.refreshHistoryButtons();
    }

    renderRegionsList();
    UI.updateExportButton();
  },

  /** Public: add a brand-new region with an auto-assigned colour and label */
  add(start, end) {
    const id       = crypto.randomUUID();
    const colorIdx = State.colorCycle++ % REGION_PALETTE.length;
    const label    = `Cut ${State.regionMap.size + 1}`;
    Regions._create(id, start, end, colorIdx, label, true);
    return id;
  },

  /** Public: remove a region (undo-able) */
  remove(id) {
    Regions._remove(id, true);
  },

  /** Called by the WaveSurfer region-updated event when user resizes/drags */
  onUpdated(id) {
    const data = State.regionMap.get(id);
    if (!data) return;

    const prevStart = data.start;
    const prevEnd   = data.end;
    const newStart  = data.wsRef.start;
    const newEnd    = data.wsRef.end;

    data.start = newStart;
    data.end   = newEnd;

    History.push({
      undo: () => {
        const d = State.regionMap.get(id);
        if (!d) return;
        d.wsRef.setOptions({ start: prevStart, end: prevEnd });
        d.start = prevStart;
        d.end   = prevEnd;
        renderRegionsList();
      },
      redo: () => {
        const d = State.regionMap.get(id);
        if (!d) return;
        d.wsRef.setOptions({ start: newStart, end: newEnd });
        d.start = newStart;
        d.end   = newEnd;
        renderRegionsList();
      },
    });
    UI.refreshHistoryButtons();
    renderRegionsList();
  },

  /** Update region bounds from the inline time editor */
  updateTime(id, newStart, newEnd) {
    const data = State.regionMap.get(id);
    if (!data) return;

    newStart = Math.max(0, Math.min(newStart, State.duration - 0.1));
    newEnd   = Math.max(newStart + 0.1, Math.min(newEnd, State.duration));

    const prevStart = data.start;
    const prevEnd   = data.end;

    data.wsRef.setOptions({ start: newStart, end: newEnd });
    data.start = newStart;
    data.end   = newEnd;

    History.push({
      undo: () => {
        const d = State.regionMap.get(id);
        if (!d) return;
        d.wsRef.setOptions({ start: prevStart, end: prevEnd });
        d.start = prevStart;
        d.end   = prevEnd;
        renderRegionsList();
      },
      redo: () => {
        const d = State.regionMap.get(id);
        if (!d) return;
        d.wsRef.setOptions({ start: newStart, end: newEnd });
        d.start = newStart;
        d.end   = newEnd;
        renderRegionsList();
      },
    });
    UI.refreshHistoryButtons();
    renderRegionsList();
  },

  /** Remove all regions, optionally creating an undo step */
  clearAll(addToHistory = true) {
    if (State.regionMap.size === 0) return;

    const snapshots = [...State.regionMap.entries()].map(([id, d]) => ({
      id,
      start:    d.wsRef.start,
      end:      d.wsRef.end,
      colorIdx: d.colorIdx,
      label:    d.label,
    }));

    [...State.regionMap.keys()].forEach(id => {
      State.regionMap.get(id).wsRef.remove();
      State.regionMap.delete(id);
    });

    if (addToHistory) {
      History.push({
        undo: () => snapshots.forEach(s =>
          Regions._create(s.id, s.start, s.end, s.colorIdx, s.label, false)
        ),
        redo: () => Regions.clearAll(false),
      });
      UI.refreshHistoryButtons();
    }

    renderRegionsList();
    UI.updateExportButton();
  },

  /** Return all regions sorted by start time */
  getSorted() {
    return [...State.regionMap.entries()]
      .map(([id, d]) => ({
        id,
        start:    d.wsRef.start,
        end:      d.wsRef.end,
        colorIdx: d.colorIdx,
        label:    d.label,
      }))
      .sort((a, b) => a.start - b.start);
  },
};

/* ══════════════════════════════════════════════════════════════
   RENDER REGION LIST  –  DOM rendering + event delegation
═══════════════════════════════════════════════════════════════ */

/**
 * Rebuild the cut-regions panel from State.regionMap.
 * Uses State.ws?.setTime() directly for seek — no WS import needed.
 */
export function renderRegionsList() {
  const list    = document.getElementById("regions-list");
  const empty   = document.getElementById("regions-empty");
  const countEl = document.getElementById("regions-count");

  const sorted = Regions.getSorted();
  countEl.textContent = sorted.length;

  if (sorted.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");

  // Notify events.js to auto-save session (decoupled via DOM event — no import needed)
  document.dispatchEvent(new CustomEvent("regions-changed"));

  list.innerHTML = sorted.map(r => {
    const palette  = REGION_PALETTE[r.colorIdx % REGION_PALETTE.length];
    const dur      = r.end - r.start;
    const isActive = r.id === State.activeRegionId;
    return `
    <li class="region-item ${isActive ? "active" : ""}"
        data-id="${r.id}" tabindex="0" role="listitem">
      <span class="region-color-dot"
            style="background:${palette.border}; color:${palette.border}">
      </span>
      <span class="region-label">${escHtml(r.label)}</span>

      <div class="region-time-group">
        <span class="region-time" data-id="${r.id}" data-field="start"
              title="Click to edit start time">${_fmtTime(r.start)}</span>
        <span class="region-time-sep">→</span>
        <span class="region-time" data-id="${r.id}" data-field="end"
              title="Click to edit end time">${_fmtTime(r.end)}</span>
        <span class="region-duration">(${_fmtTime(dur)})</span>
      </div>

      <div class="region-actions">
        <button class="region-btn play-region-btn" data-id="${r.id}"
                title="Seek to region start">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </button>
        <button class="region-btn delete delete-region-btn" data-id="${r.id}"
                title="Remove region (Del)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>
    </li>`;
  }).join("");

  // ── Event delegation ───────────────────────────────────────

  // Seek-to-start buttons
  list.querySelectorAll(".play-region-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const d = State.regionMap.get(btn.dataset.id);
      if (d && State.ws) State.ws.setTime(Math.max(0, d.wsRef.start));
    });
  });

  // Delete buttons
  list.querySelectorAll(".delete-region-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      Regions.remove(btn.dataset.id);
      UI.showToast("Cut removed (Ctrl+Z to undo)", "info");
    });
  });

  // Row click → seek + highlight
  list.querySelectorAll(".region-item").forEach(item => {
    item.addEventListener("click", () => {
      const d = State.regionMap.get(item.dataset.id);
      if (d && State.ws) State.ws.setTime(Math.max(0, d.wsRef.start));
      UI.highlightRegionInList(item.dataset.id);
    });
    item.addEventListener("keydown", e => {
      if (e.key === "Delete" || e.key === "Backspace") Regions.remove(item.dataset.id);
    });
    // Right-click → context menu (handled in events.js via DOM event)
    item.addEventListener("contextmenu", e => {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent("region-contextmenu", {
        detail: { id: item.dataset.id, x: e.clientX, y: e.clientY },
      }));
    });
  });

  // Time chips → inline editor
  list.querySelectorAll(".region-time").forEach(chip => {
    chip.addEventListener("click", e => {
      e.stopPropagation();
      openTimeEditor(chip);
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   INLINE TIME EDITOR
═══════════════════════════════════════════════════════════════ */

/** Replace a time chip with a focused <input> for precision editing */
export function openTimeEditor(chip) {
  if (chip.classList.contains("editing")) return;
  chip.classList.add("editing");

  const id    = chip.dataset.id;
  const field = chip.dataset.field;

  const input = document.createElement("input");
  input.type      = "text";
  input.className = "region-time-input";
  input.value     = chip.textContent.trim();
  input.setAttribute("aria-label", `Edit ${field} time`);
  chip.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    const secs = _parseTime(input.value);
    if (!isNaN(secs)) {
      const data = State.regionMap.get(id);
      if (data) {
        const newStart = field === "start" ? secs : data.wsRef.start;
        const newEnd   = field === "end"   ? secs : data.wsRef.end;
        Regions.updateTime(id, newStart, newEnd);
      }
    }
    renderRegionsList();
  };

  input.addEventListener("blur", commit);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter")  { e.preventDefault(); commit(); }
    if (e.key === "Escape") { e.preventDefault(); renderRegionsList(); }
  });
}
