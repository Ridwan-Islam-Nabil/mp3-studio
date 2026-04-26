/**
 * api.js — all communication with the Flask backend.
 * Pure fetch wrappers. No DOM, no state mutations, no imports.
 */

export const API = {
  async fetchInfo(url) {
    const res = await fetch("/api/info", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ url }),
    });
    return res.json();
  },

  async startDownload(url) {
    const res = await fetch("/api/download", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ url }),
    });
    return res.json();
  },

  async pollStatus(taskId) {
    const res = await fetch(`/api/status/${taskId}`);
    return res.json();
  },

  async exportMp3(filename, regions, title, duration, customTitle = "") {
    const res = await fetch("/api/export", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ filename, regions, title, duration, custom_title: customTitle }),
    });
    return res.json();
  },

  /**
   * SSE export: streams real FFmpeg progress back to the client.
   * @param {Function} onProgress  - called with (pct: number, msg: string)
   * @returns {Promise<object>}    - resolves with the final SSE event object
   */
  async exportStream(filename, regions, title, duration, customTitle, onProgress) {
    const res = await fetch("/api/export_stream", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ filename, regions, title, duration, custom_title: customTitle }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";   // keep incomplete last line

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          if (ev.type === "progress") {
            onProgress(ev.pct, ev.msg);
          } else if (["done", "cancelled", "error"].includes(ev.type)) {
            return ev;
          }
        } catch { /* skip malformed lines */ }
      }
    }

    return { type: "error", message: "Stream ended unexpectedly." };
  },

  /** Generate the merged preview MP3 server-side (kept regions only). */
  async previewExport(filename, regions, title, duration) {
    const res = await fetch("/api/preview_export", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ filename, regions, title, duration }),
    });
    return res.json();
  },

  /** Open folder-picker on the server and save the generated preview file. */
  async savePreview(previewFilename, title, customTitle = "") {
    const res = await fetch("/api/save_preview", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ preview_filename: previewFilename, title, custom_title: customTitle }),
    });
    return res.json();
  },

  async cleanup(filename, previewFilename = null) {
    await fetch("/api/cleanup", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ filename, preview_filename: previewFilename }),
    });
  },
};
