/**
 * The editor for one loaded file. AudioEditor renders it with `key={fileUrl}`, so choosing
 * another file remounts it: WaveSurfer, regions, history, playback settings, zoom, preview,
 * region play/loop and export state all start fresh without a manual reset list.
 *
 * This component only wires hooks to presentational components:
 *   - useKeyboardShortcuts → `onShortcut` below, calling the same callbacks the buttons use
 *   - useSessionAutosave   → restores/saves this file's cuts in localStorage
 *   - useRegionPlayback    → ▶ / ⟲ per region row, `L`
 *   - new FFmpeg actions   → extend useFFmpegJob (reuse run()/reportFailure()), buttons in
 *                            ui/ActionButtons.tsx
 */

import { useRef, useState } from "react";
import type RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import { baseName } from "./editorUtils";
import { useFFmpegJob } from "./hooks/useFFmpegJob";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { SKIP_SECONDS, usePlayback } from "./hooks/usePlayback";
import { useRegionHistory } from "./hooks/useRegionHistory";
import { useRegionPlayback } from "./hooks/useRegionPlayback";
import { useSessionAutosave } from "./hooks/useSessionAutosave";
import { useWaveSurfer } from "./hooks/useWaveSurfer";
import type { ShortcutAction } from "./shortcuts";
import { cutColor } from "./theme";
import { ExportButton, MarkToCutButton, PreviewButton } from "./ui/ActionButtons";
import { EditorToolbar } from "./ui/EditorToolbar";
import { PlaybackBar } from "./ui/PlaybackBar";
import { PreviewModal } from "./ui/PreviewModal";
import { RegionList } from "./ui/RegionList";
import { ShortcutsOverlay } from "./ui/ShortcutsOverlay";
import { WaveformCard } from "./ui/WaveformCard";

/** Length of the region "Mark to Cut" (and `N`) drops, centered on the playhead. */
const MARK_SECONDS = 10;

interface Props {
  file: File;
  fileUrl: string;
  onReplaceFile: (f: File) => void;
}

export default function EditorSession({ file, fileUrl, onReplaceFile }: Props) {
  const [outputName, setOutputName] = useState(() => baseName(file.name));
  const [zoomSlider, setZoomSlider] = useState(0); // 0–100 log slider position
  const [fullscreen, setFullscreen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const pluginRef = useRef<RegionsPlugin | null>(null);
  const history = useRegionHistory(pluginRef);
  const wave = useWaveSurfer({
    fileUrl,
    zoomSlider,
    pluginRef,
    onRegionCreated: history.onRegionCreated,
    onRegionUpdated: history.onRegionUpdated,
    onRegionDoubleClicked: history.onRegionDoubleClicked,
  });
  const playback = usePlayback(wave.wsRef);
  const regionPlay = useRegionPlayback(wave.wsRef, history.regionsRef);
  const job = useFFmpegJob({ file, duration: wave.duration, regions: history.regions, outputName });
  useSessionAutosave({
    file,
    duration: wave.duration,
    regions: history.regions,
    loadRegions: history.loadRegions,
    clearRegions: history.reset,
  });

  /** Drops a cut centered on the playhead; the region-created handler records it. */
  const markToCut = () => {
    const { duration, currentTime } = wave;
    if (!pluginRef.current || duration === 0) return;
    pluginRef.current.addRegion({
      start: Math.max(0, currentTime - MARK_SECONDS / 2),
      end: Math.min(duration, currentTime + MARK_SECONDS / 2),
      color: cutColor(), drag: true, resize: true,
    });
  };

  /** Keyboard shortcuts (mapping in shortcuts.ts). Returns true when the key was used. */
  const onShortcut = (action: ShortcutAction): boolean => {
    // Esc closes the topmost thing: shortcuts overlay → preview modal → fullscreen.
    if (action === "escape") {
      if (showShortcuts) setShowShortcuts(false);
      else if (job.showPreview) job.closePreview();
      else if (fullscreen) setFullscreen(false);
      else return false;
      return true;
    }
    if (job.showPreview) return false; // the preview modal keeps its own keys (audio controls)
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
    />
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
        />
      )}
      {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}

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
      />

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
      />

      <PlaybackBar playback={playback} isPlaying={wave.isPlaying} currentTime={wave.currentTime} duration={wave.duration}>
        <MarkToCutButton onClick={markToCut} disabled={wave.duration === 0} />
        <PreviewButton onClick={job.handlePreview} disabled={job.isProcessing}
          running={job.previewing} progress={job.previewProgress} />
        <ExportButton onClick={job.handleExport} disabled={job.isProcessing}
          running={job.exporting} progress={job.exportProgress} done={job.exportDone} />
      </PlaybackBar>

      {regionList(false)}
    </>
  );
}
