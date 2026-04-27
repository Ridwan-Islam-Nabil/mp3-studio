/**
 * upload.js — Upload tab: file selection, drag-and-drop, XHR upload,
 * and handoff to the waveform editor.
 *
 * Imports: state.js, ui.js, api.js, utils.js, wavesurfer.js (loadEditor).
 * No circular dependencies.
 */

import { State }          from "./state.js";
import { UI }             from "./ui.js";
import { _fmtSize, ext }  from "./utils.js";
import { loadEditor }     from "./wavesurfer.js";

const ALLOWED_EXTS = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".opus"]);

let _selectedFile = null;

/** Reset the staged file — called by handleNewSession in events.js */
export function clearSelectedFile() {
  _selectedFile = null;
}

/* ══════════════════════════════════════════════════════════════
   INIT  –  wire up upload tab events
═══════════════════════════════════════════════════════════════ */

export function initUploadTab() {
  const dropZone  = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const browseBtn = document.getElementById("browse-btn");

  // Browse button — stop propagation so the drop-zone click doesn't also fire
  browseBtn.addEventListener("click", e => {
    e.stopPropagation();
    fileInput.click();
  });

  // Clicking anywhere on the drop zone opens the picker
  dropZone.addEventListener("click",   () => fileInput.click());
  dropZone.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
  });

  // File input change (native picker)
  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) _stageFile(fileInput.files[0]);
  });

  // Drag & drop
  dropZone.addEventListener("dragenter", e => { e.preventDefault(); dropZone.classList.add("drag-over"); });
  dropZone.addEventListener("dragover",  e => { e.preventDefault(); dropZone.classList.add("drag-over"); });
  dropZone.addEventListener("dragleave", e => {
    if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove("drag-over");
  });
  dropZone.addEventListener("drop", e => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) _stageFile(file);
  });

  // "Open in Waveform Editor" button
  document.getElementById("open-editor-btn").addEventListener("click", () => {
    if (_selectedFile) _handleFileUpload(_selectedFile);
  });
}

/* ══════════════════════════════════════════════════════════════
   STAGE FILE  –  validate + show preview card
═══════════════════════════════════════════════════════════════ */

function _stageFile(file) {
  const fileExt = ext(file.name);
  const errEl   = document.getElementById("upload-error");

  if (!ALLOWED_EXTS.has(fileExt)) {
    errEl.textContent = `Unsupported format "${fileExt}". Allowed: MP3, WAV, M4A, AAC, OGG, FLAC, OPUS`;
    errEl.classList.remove("hidden");
    return;
  }

  errEl.classList.add("hidden");
  _selectedFile = file;

  document.getElementById("file-name").textContent = file.name;
  document.getElementById("file-size").textContent  = _fmtSize(file.size);
  document.getElementById("file-preview").classList.remove("hidden");
  document.getElementById("file-preview").classList.add("slide-down");
}

/* ══════════════════════════════════════════════════════════════
   UPLOAD  –  XHR with progress → editor handoff
═══════════════════════════════════════════════════════════════ */

async function _handleFileUpload(file) {
  UI.showStep("step-progress");
  document.getElementById("progress-message").textContent = "Uploading file…";
  document.getElementById("progress-fill").style.width    = "0%";
  document.getElementById("progress-pct").textContent     = "0%";

  const formData = new FormData();
  formData.append("file", file);

  return new Promise(resolve => {
    const xhr = new XMLHttpRequest();

    // Progress bar (capped at 85 % — rest is server-side conversion)
    xhr.upload.addEventListener("progress", e => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 85);
      document.getElementById("progress-fill").style.width = pct + "%";
      document.getElementById("progress-pct").textContent  = pct + "%";
      document.getElementById("progress-message").textContent =
        ext(file.name) === ".mp3"
          ? `Uploading… ${pct}%`
          : `Uploading… ${pct}% (will convert to MP3)`;
    });

    xhr.addEventListener("load", async () => {
      if (xhr.status === 200) {
        let result;
        try   { result = JSON.parse(xhr.responseText); }
        catch { result = { error: "Invalid server response" }; }

        if (result.error) {
          UI.showStep("step-input");
          UI.showToast(result.error, "error", 5000);
          return resolve();
        }

        document.getElementById("progress-message").textContent = "Ready!";
        document.getElementById("progress-fill").style.width    = "100%";
        document.getElementById("progress-pct").textContent     = "100%";

        State.filename  = result.filename;
        State.title     = result.title;
        State.duration  = result.duration;
        State.thumbnail = "";
        State.channel   = "Local File";
        State.videoUrl  = "";

        await loadEditor();
      } else {
        UI.showStep("step-input");
        UI.showToast(`Upload failed (status ${xhr.status}). Try again.`, "error", 5000);
      }
      resolve();
    });

    xhr.addEventListener("error", () => {
      UI.showStep("step-input");
      UI.showToast("Upload failed. Check your connection.", "error", 5000);
      resolve();
    });

    xhr.open("POST", "/api/upload");
    xhr.send(formData);
  });
}
