/**
 * state.js — single source of truth + undo/redo command stack.
 *
 * IMPORTANT: History methods do NOT call UI.refreshHistoryButtons().
 * Every caller is responsible for refreshing the buttons afterward.
 * This keeps state.js free of any imports and prevents circular deps.
 */

export const State = {
  // ── Download / meta ──────────────────────────────────────────
  taskId:    null,
  filename:  null,
  title:     "",
  duration:  0,
  thumbnail: "",
  channel:   "",
  videoUrl:  "",

  // ── WaveSurfer (set by wavesurfer.js) ───────────────────────
  ws:        null,
  wsRegions: null,
  isPlaying: false,

  // ── Region tracking  { id → { wsRef, start, end, colorIdx, label } }
  regionMap:  new Map(),
  colorCycle: 0,

  // ── Undo/Redo stack ──────────────────────────────────────────
  history: [],
  histPtr: -1,

  // ── Preview ──────────────────────────────────────────────────
  previewActive:      false,   // true while the preview modal is open
  currentPreviewFile: null,    // "prev_xxx.mp3" currently loaded in the modal
  activeRegionId:     null,

  // ── Loop region ──────────────────────────────────────────────
  loopActive:   false,         // true while a region is looping
  loopRegionId: null,          // id of the region being looped

  // ── Polling timer ────────────────────────────────────────────
  pollTimer: null,
};

export const History = {
  push(cmd) {
    // Drop any redo future, then append
    State.history.splice(State.histPtr + 1);
    State.history.push(cmd);
    State.histPtr = State.history.length - 1;
    // Caller must call UI.refreshHistoryButtons() after push
  },

  undo() {
    if (!History.canUndo()) return;
    State.history[State.histPtr].undo();
    State.histPtr--;
    // Caller must call UI.refreshHistoryButtons() after undo
  },

  redo() {
    if (!History.canRedo()) return;
    State.histPtr++;
    State.history[State.histPtr].redo();
    // Caller must call UI.refreshHistoryButtons() after redo
  },

  canUndo() { return State.histPtr >= 0; },
  canRedo()  { return State.histPtr < State.history.length - 1; },

  clear() {
    State.history = [];
    State.histPtr = -1;
    // Caller must call UI.refreshHistoryButtons() after clear
  },
};
