/**
 * app.js — Entry point. Boots the application on DOMContentLoaded.
 *
 * All logic lives in focused modules:
 *   constants.js  – shared constants
 *   utils.js      – pure helpers (format, parse, escape)
 *   state.js      – State singleton + History command stack
 *   api.js        – fetch wrappers (no DOM, no state)
 *   ui.js         – generic DOM helpers (toast, steps, seek bar…)
 *   regions.js    – region CRUD, list rendering, inline time editor
 *   wavesurfer.js – WaveSurfer lifecycle, Preview, cursor, zoom UI
 *   upload.js     – Upload tab: drag-drop, XHR upload
 *   events.js     – event wiring, async flows, fullscreen, keyboard
 */

import { initEvents }           from "./events.js";
import { initUploadTab }        from "./upload.js";
import { initWaveformCursor,
         updateZoomUI }         from "./wavesurfer.js";
import { UI }                   from "./ui.js";

document.addEventListener("DOMContentLoaded", () => {
  initEvents();
  initUploadTab();
  initWaveformCursor();
  updateZoomUI(0);              // paint the slider fill at the default zoom (position 0 = 1×)
  UI.refreshHistoryButtons();
  UI.updateExportButton();
  console.log(
    "%c🎵 Audio Studio loaded — v5",
    "color:#7c3aed;font-weight:700;font-size:14px"
  );
});
