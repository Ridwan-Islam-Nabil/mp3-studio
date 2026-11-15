/**
 * Preview / export runner around lib/ffmpeg.ts.
 *
 * - Progress: loading FFmpeg maps to 0–20 % (loadFFmpeg reports only 0 and 100),
 *   trimming to 20–100 %.
 * - Only one job at a time: Preview and Export are no-ops while either is running.
 * - Failures: tracked as `export_failed` (stage "load" for FFmpegLoadError) and shown as an
 *   error toast; out-of-memory errors get a "try a shorter or compressed file" message.
 * - Object URLs: the export blob URL is revoked right after the download starts; the preview
 *   URL is revoked when replaced and when the editor session unmounts (new file).
 *
 * New FFmpeg-backed actions (wave 3: split export, formats, …) should reuse `run()` and
 * `reportFailure()` so progress, analytics and errors stay consistent.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadFFmpeg, trimAndExport, FFmpegLoadError, isLikelyOutOfMemory, type CutRegion,
} from "@/lib/ffmpeg";
import { trackExportCompleted, trackExportFailed, trackPreviewOpened } from "@/lib/analytics";
import { fileFormat, fileSizeMb } from "../editorUtils";
import { useToast } from "../toast/ToastProvider";
import type { RegionData } from "../types";

export const OUT_OF_MEMORY_MESSAGE =
  "Your browser ran out of memory processing this file. " +
  "Try a shorter clip, or convert it to a compressed format (e.g. MP3) first — " +
  "long WAV/FLAC files are the most likely to hit this limit.";

interface Options {
  file: File;
  duration: number;
  regions: RegionData[];
  /** Download name without extension. */
  outputName: string;
}

/** Starts a browser download of `url` as `name`. */
function triggerDownload(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
}

export function useFFmpegJob({ file, duration, regions, outputName }: Options) {
  const toast = useToast();

  const [exporting, setExporting]           = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportDone, setExportDone]         = useState(false);

  const [previewing, setPreviewing]           = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewUrl, setPreviewUrl]           = useState<string | null>(null);
  const [showPreview, setShowPreview]         = useState(false);
  const previewUrlRef = useRef<string | null>(null); // for the unmount cleanup

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const isProcessing = exporting || previewing;
  const fileName = (outputName || "output") + ".mp3";

  /** Loads FFmpeg (first time only) and renders the current cuts to an MP3 blob. */
  const run = useCallback(async (onProg: (p: number) => void): Promise<Blob> => {
    await loadFFmpeg((p) => onProg(Math.round(p * 0.2)));
    const cuts: CutRegion[] = regions.map(({ start, end }) => ({ start, end }));
    return trimAndExport(file, cuts, duration, (p) => onProg(20 + Math.round(p * 0.8)));
  }, [file, duration, regions]);

  /** Records a failed Preview/Export and tells the user. */
  const reportFailure = useCallback((kind: "export" | "preview", e: unknown) => {
    const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    trackExportFailed({
      stage: e instanceof FFmpegLoadError ? "load" : kind,
      format: fileFormat(file.name),
      sizeMB: fileSizeMb(file.size),
      durationSec: Math.round(duration),
      cutCount: regions.length,
      message,
    });
    const title = kind === "export" ? "Export failed." : "Preview failed.";
    toast.error(title, isLikelyOutOfMemory(e) ? OUT_OF_MEMORY_MESSAGE : message);
  }, [file, duration, regions.length, toast]);

  // ─── Preview ───────────────────────────────────────────────────────────────

  const handlePreview = useCallback(async () => {
    if (isProcessing) return;
    setPreviewing(true); setPreviewProgress(0);
    try {
      const blob = await run(setPreviewProgress);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setShowPreview(true);
      trackPreviewOpened({ cutCount: regions.length });
    } catch (e) { reportFailure("preview", e); }
    finally { setPreviewing(false); }
  }, [isProcessing, run, regions.length, reportFailure]);

  const closePreview = useCallback(() => setShowPreview(false), []);

  /** "Download MP3" in the preview modal — saves the already-rendered preview. */
  const downloadPreview = useCallback(() => {
    if (!previewUrl) return;
    triggerDownload(previewUrl, fileName);
    setExportDone(true);
    setShowPreview(false);
    toast.success("Download started", fileName);
  }, [previewUrl, fileName, toast]);

  // ─── Export ────────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    if (isProcessing) return;
    setExporting(true); setExportProgress(0); setExportDone(false);
    try {
      const blob = await run(setExportProgress);
      const url = URL.createObjectURL(blob);
      triggerDownload(url, fileName);
      URL.revokeObjectURL(url);
      setExportDone(true);
      const cutDur = regions.reduce((s, r) => s + (r.end - r.start), 0);
      trackExportCompleted({
        cutCount: regions.length,
        durationSec: Math.round(duration),
        outputDurationSec: Math.round(duration - cutDur),
      });
      toast.success("Export complete", fileName);
    } catch (e) { reportFailure("export", e); }
    finally { setExporting(false); }
  }, [isProcessing, run, fileName, regions, duration, reportFailure, toast]);

  return {
    exporting, exportProgress, exportDone,
    previewing, previewProgress, previewUrl, showPreview,
    isProcessing,
    handlePreview, closePreview, downloadPreview, handleExport,
    run, reportFailure,
  };
}

export type FFmpegJob = ReturnType<typeof useFFmpegJob>;
