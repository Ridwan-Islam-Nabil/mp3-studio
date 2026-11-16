/**
 * The editor for one loaded file. AudioEditor renders it with `key={fileUrl}`, so choosing
 * another file remounts it: WaveSurfer, regions, history, playback settings, zoom, preview,
 * region play/loop and export state all start fresh without a manual reset list.
 * (Tools panel settings are per visit, not per file: they come from AudioEditor in `tools`.)
 *
 * This component only wires hooks to presentational components:
 *   - useKeyboardShortcuts → `onShortcut` below, calling the same callbacks the buttons use
 *   - useSessionAutosave   → restores/saves this file's regions (and mode) in localStorage
 *   - useRegionPlayback    → ▶ / ⟲ per region row, `L`
 *   - useFFmpegJob         → Preview / Export / Detect silence / Export this section
 *   - ToolsPanel           → settings (tools.update), mode switch (asks via ModeSwitchDialog
 *                            when regions exist), Detect silence
 */

import { useEffect, useRef, useState } from "react";
import type RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import { trackToolUsed } from "@/lib/analytics";
import { formatInfo } from "@/lib/ffmpeg";
import { baseName } from "./editorUtils";
import { useFFmpegJob } from "./hooks/useFFmpegJob";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { SKIP_SECONDS, usePlayback } from "./hooks/usePlayback";
import { useRegionHistory } from "./hooks/useRegionHistory";
import { useRegionPlayback } from "./hooks/useRegionPlayback";
import { useSessionAutosave } from "./hooks/useSessionAutosave";
import type { ToolSettingsApi } from "./hooks/useToolSettings";
import { useWaveSurfer } from "./hooks/useWaveSurfer";
import type { ShortcutAction } from "./shortcuts";
import { keepText, regionColor } from "./theme";
import { useToast } from "./toast/ToastProvider";
import {
  applySilence, keptLength, keptSegments, regionsForModeSwitch,
  type ModeConversion, type ToolSettings,
} from "./toolSettings";
import type { RegionMode } from "./types";
import { ExportButton, MarkToCutButton, PreviewButton } from "./ui/ActionButtons";
import { EditorToolbar } from "./ui/EditorToolbar";
import { ModeSwitchDialog } from "./ui/ModeSwitchDialog";
import { PlaybackBar } from "./ui/PlaybackBar";
import { PreviewModal } from "./ui/PreviewModal";
import { RegionList } from "./ui/RegionList";
import { ShortcutsOverlay } from "./ui/ShortcutsOverlay";
import { SilencePrompt } from "./ui/ToolBanners";
import { ToolsPanel } from "./ui/ToolsPanel";
import { WaveformCard } from "./ui/WaveformCard";

/** Length of the region "Mark to Cut" (and `N`) drops, centered on the playhead. */
const MARK_SECONDS = 10;

interface Props {
  file: File;
  fileUrl: string;
  onReplaceFile: (f: File) => void;
  tools: ToolSettingsApi;
}

/** Analytics for a settings change from the Tools panel (settings only, no file data). */
function trackSettingsChange(patch: Partial<ToolSettings>, next: ToolSettings) {
  if ("normalize" in patch) trackToolUsed({ tool: "normalize", enabled: next.normalize });
  if ("format" in patch || "quality" in patch) trackToolUsed({ tool: "convert", format: next.format, quality: next.quality });
  if ("fadeIn" in patch || "fadeOut" in patch || "fadeInSec" in patch || "fadeOutSec" in patch) {
    trackToolUsed({ tool: "fade", fadeIn: next.fadeIn, fadeOut: next.fadeOut });
  }
  if ("ringtone" in patch) trackToolUsed({ tool: "ringtone", device: next.ringtone });
}

export default function EditorSession({ file, fileUrl, onReplaceFile, tools }: Props) {
  const toast = useToast();
  const [outputName, setOutputName] = useState(() => baseName(file.name));
  const [zoomSlider, setZoomSlider] = useState(0); // 0–100 log slider position
  const [fullscreen, setFullscreen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  /** Mode the user asked to switch to while regions exist (dialog open), or null. */
  const [pendingMode, setPendingMode] = useState<RegionMode | null>(null);
  /** `?tool=remove-silence`: the one-click prompt, until used or dismissed. */
  const [silencePrompt, setSilencePrompt] = useState(tools.highlight === "remove-silence");

  const pluginRef = useRef<RegionsPlugin | null>(null);
  const history = useRegionHistory(pluginRef, tools.initialMode);
  const mode = history.mode;
  const wave = useWaveSurfer({
    fileUrl,
    zoomSlider,
    pluginRef,
    onRegionCreated: history.onRegionCreated,
    onRegionUpdated: history.onRegionUpdated,
    onRegionDoubleClicked: history.onRegionDoubleClicked,
    regionMode: mode,
  });
  const playback = usePlayback(wave.wsRef);
  const regionPlay = useRegionPlayback(wave.wsRef, history.regionsRef);
  const job = useFFmpegJob({
    file, duration: wave.duration, regions: history.regions, mode, settings: tools.settings, outputName,
  });
  useSessionAutosave({
    file,
    duration: wave.duration,
    regions: history.regions,
    mode,
    loadRegions: history.loadRegions,
    clearRegions: history.reset,
  });

  // Toast "Undo" buttons run later, after history has moved on: always call the latest undo.
  const undoRef = useRef(history.undo);
  useEffect(() => { undoRef.current = history.undo; }, [history.undo]);
  const undoAction = { label: "Undo", onClick: () => undoRef.current() };

  const ready = wave.duration > 0;
  const keptSec = keptLength(history.regions, wave.duration, mode);
  const keptParts = mode === "cut" && history.regions.length > 0 ? keptSegments(history.regions, wave.duration, "cut") : [];

  /** Drops a region (cut or keep, by mode) centered on the playhead; region-created records it. */
  const markToCut = () => {
    const { duration, currentTime } = wave;
    if (!pluginRef.current || duration === 0) return;
    pluginRef.current.addRegion({
      start: Math.max(0, currentTime - MARK_SECONDS / 2),
      end: Math.min(duration, currentTime + MARK_SECONDS / 2),
      color: regionColor(mode), drag: true, resize: true,
    });
  };

  const changeSettings = (patch: Partial<ToolSettings>) => {
    tools.update(patch);
    trackSettingsChange(patch, { ...tools.settings, ...patch });
  };

  // ─── Keep mode ───────────────────────────────────────────────────────────────

  const requestMode = (to: RegionMode) => {
    if (to === mode) return;
    if (history.regions.length === 0) {
      history.switchMode(to);
      trackToolUsed({ tool: "keep", mode: to, conversion: "none" });
      return;
    }
    setPendingMode(to);
  };

  const confirmMode = (how: ModeConversion) => {
    const to = pendingMode;
    setPendingMode(null);
    if (!to) return;
    const ranges = regionsForModeSwitch(history.regionsRef.current, wave.duration, to, how);
    history.switchMode(to, ranges);
    trackToolUsed({ tool: "keep", mode: to, conversion: how });
    toast.info(
      to === "keep" ? "Keep mode: green regions are saved" : "Cut mode: red regions are removed",
      how === "convert" ? "Your regions were converted — the result is the same." : "Same regions, new meaning.",
      { action: undoAction },
    );
  };

  // ─── Remove silence ──────────────────────────────────────────────────────────

  const detectSilence = async () => {
    setSilencePrompt(false);
    const settings = tools.silence;
    const silences = await job.handleDetectSilence(settings);
    if (!silences) return;
    const res = applySilence(history.regionsRef.current, silences, wave.duration, mode);
    if (res.kind === "add") history.addRegions(res.ranges);
    else if (res.count > 0) history.replaceRegions(res.ranges);
    trackToolUsed({ tool: "remove-silence", cutsAdded: res.count, ...settings, mode });

    if (res.count === 0) {
      toast.info("No silence found",
        `Nothing quieter than ${settings.thresholdDb} dB for ${settings.minSilenceSec.toFixed(1)} s or longer. ` +
        "Try a higher threshold or a shorter length under Tools → Remove silence → Advanced.");
      return;
    }
    const n = res.count;
    toast.success(
      mode === "keep" ? `Removed ${n} silent part${n === 1 ? "" : "s"}` : `Added ${n} cut${n === 1 ? "" : "s"} for silence`,
      "Review them in the list, or undo with Ctrl+Z.",
      { action: undoAction },
    );
  };

  /** Keyboard shortcuts (mapping in shortcuts.ts). Returns true when the key was used. */
  const onShortcut = (action: ShortcutAction): boolean => {
    // Esc closes the topmost thing: mode dialog → shortcuts overlay → preview modal → fullscreen.
    if (action === "escape") {
      if (pendingMode) setPendingMode(null);
      else if (showShortcuts) setShowShortcuts(false);
      else if (job.showPreview) job.closePreview();
      else if (fullscreen) setFullscreen(false);
      else return false;
      return true;
    }
    if (job.showPreview || pendingMode) return false; // modals keep their own keys
    if (action === "showShortcuts") { setShowShortcuts((s) => !s); return true; }
    if (showShortcuts || wave.duration === 0) return false;

    switch (action) {
      case "togglePlay":       playback.togglePlay(); break;
      case "markCut":          markToCut(); break;
      case "preview":          void job.handlePreview(); break;
      case "toggleFullscreen": setFullscreen((f) => !f); break;
      case "undo":             history.undo(); break;
      case "redo":             history.redo(); break;
      case "skipBack":         playback.skip(-SKIP_SECONDS); break;
      case "skipForward":      playback.skip(SKIP_SECONDS); break;
      case "stopLoop":         regionPlay.stopLoop(); break;
    }
    return true;
  };
  useKeyboardShortcuts(onShortcut);

  const regionList = (compact: boolean) => (
    <RegionList
      compact={compact}
      regions={history.regions}
      duration={wave.duration}
      onRemove={history.removeRegion}
      onChangeTimes={history.updateRegionTimes}
      activeRegion={regionPlay.active}
      onPlay={regionPlay.playRegion}
      onLoop={regionPlay.loopRegion}
      mode={mode}
      keptParts={keptParts}
      onExportSection={(section, index, count, key) => void job.exportSection(section, index, count, key)}
      exportingKey={job.sectionKey}
      exportProgress={job.sectionProgress}
      busy={job.isProcessing}
      highlightSplit={tools.highlight === "split"}
    />
  );

  const extension = formatInfo(job.format).extension;
  const modeBadge = (
    <span data-testid="mode-badge" data-mode={mode} style={{
      fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", borderRadius: 5, padding: "2px 7px",
      ...(mode === "keep"
        ? { color: keepText, background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.4)" }
        : { color: "#fca5a5", background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.3)" }),
    }}>
      {mode === "keep" ? "✓ KEEP MODE" : "✂ CUT MODE"}
    </span>
  );

  return (
    <>
      {job.showPreview && job.previewUrl && (
        <PreviewModal
          url={job.previewUrl}
          cutCount={history.regions.length}
          outputName={outputName}
          onOutputNameChange={setOutputName}
          onClose={job.closePreview}
          onDownload={job.downloadPreview}
          extension={job.previewExtension}
          mode={mode}
        />
      )}
      {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
      {pendingMode && (
        <ModeSwitchDialog to={pendingMode} count={history.regions.length}
          onChoose={confirmMode} onCancel={() => setPendingMode(null)} />
      )}

      <EditorToolbar
        fileName={file.name}
        outputName={outputName}
        onOutputNameChange={setOutputName}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        onReset={history.reset}
        onReplaceFile={onReplaceFile}
        extension={extension}
      />

      {silencePrompt && ready && (
        <SilencePrompt onDetect={() => void detectSilence()} onDismiss={() => setSilencePrompt(false)}
          disabled={job.isProcessing} />
      )}

      <WaveformCard
        wsRef={wave.wsRef}
        waveRef={wave.waveRef}
        minimapRef={wave.minimapRef}
        timelineRef={wave.timelineRef}
        duration={wave.duration}
        currentTime={wave.currentTime}
        fullscreen={fullscreen}
        onToggleFullscreen={() => setFullscreen((f) => !f)}
        onShowShortcuts={() => setShowShortcuts(true)}
        zoomSlider={zoomSlider}
        onZoomChange={setZoomSlider}
        zoomMin={wave.zoomMin}
        fullscreenPanel={regionList(true)}
        headerBadge={modeBadge}
        mode={mode}
      />

      <PlaybackBar playback={playback} isPlaying={wave.isPlaying} currentTime={wave.currentTime} duration={wave.duration}>
        <MarkToCutButton onClick={markToCut} disabled={wave.duration === 0} mode={mode} />
        <PreviewButton onClick={job.handlePreview} disabled={job.isProcessing}
          running={job.previewing} progress={job.previewProgress} />
        <ExportButton onClick={job.handleExport} disabled={job.isProcessing}
          running={job.exporting} progress={job.exportProgress} done={job.exportDone} extension={extension} />
      </PlaybackBar>

      <ToolsPanel
        settings={tools.settings}
        onChange={changeSettings}
        silence={tools.silence}
        onSilenceChange={tools.setSilence}
        mode={mode}
        onModeChange={requestMode}
        highlight={tools.highlight}
        keptSec={keptSec}
        ready={ready}
        busy={job.isProcessing}
        detecting={job.detecting}
        detectProgress={job.detectProgress}
        onDetectSilence={() => void detectSilence()}
      />

      {regionList(false)}
    </>
  );
}
