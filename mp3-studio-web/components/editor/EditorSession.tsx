/**
 * The editor for one loaded file. AudioEditor renders it with `key={fileUrl}`, so choosing
 * another file remounts it: WaveSurfer, regions, history, playback settings, zoom, preview and
 * export state all start fresh without a manual reset list.
 *
 * This component only wires hooks to presentational components. Wave-3 features hook in here:
 *   - keyboard shortcuts → one keydown effect next to the Esc handler, calling the same
 *     callbacks the buttons use (playback.togglePlay, history.undo/redo, markToCut, …)
 *   - session auto-save → an effect on `history.regions` (+ restore after `duration` > 0)
 *   - new FFmpeg actions → extend useFFmpegJob (reuse run()/reportFailure())
 */

import { useEffect, useRef, useState } from "react";
import type RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import { baseName } from "./editorUtils";
import { useFFmpegJob } from "./hooks/useFFmpegJob";
import { usePlayback } from "./hooks/usePlayback";
import { useRegionHistory } from "./hooks/useRegionHistory";
import { useWaveSurfer } from "./hooks/useWaveSurfer";
import { cutColor } from "./theme";
import { ExportButton, MarkToCutButton, PreviewButton } from "./ui/ActionButtons";
import { EditorToolbar } from "./ui/EditorToolbar";
import { PlaybackBar } from "./ui/PlaybackBar";
import { PreviewModal } from "./ui/PreviewModal";
import { RegionList } from "./ui/RegionList";
import { WaveformCard } from "./ui/WaveformCard";

/** Length of the region "Mark to Cut" drops, centered on the playhead. */
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
  const job = useFFmpegJob({ file, duration: wave.duration, regions: history.regions, outputName });

  // Esc exits fullscreen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
        zoomSlider={zoomSlider}
        onZoomChange={setZoomSlider}
        zoomMin={wave.zoomMin}
        fullscreenPanel={<RegionList compact regions={history.regions} onRemove={history.removeRegion} />}
      />

      <PlaybackBar playback={playback} isPlaying={wave.isPlaying} currentTime={wave.currentTime} duration={wave.duration}>
        <MarkToCutButton onClick={markToCut} disabled={wave.duration === 0} />
        <PreviewButton onClick={job.handlePreview} disabled={job.isProcessing}
          running={job.previewing} progress={job.previewProgress} />
        <ExportButton onClick={job.handleExport} disabled={job.isProcessing}
          running={job.exporting} progress={job.exportProgress} done={job.exportDone} />
      </PlaybackBar>

      <RegionList regions={history.regions} onRemove={history.removeRegion} />
    </>
  );
}
