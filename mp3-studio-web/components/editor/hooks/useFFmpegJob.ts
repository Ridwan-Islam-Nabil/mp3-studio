/**
 * FFmpeg-backed actions around lib/ffmpeg.ts: Preview, Export, Detect silence and Export one
 * section.
 *
 * - Settings: the Tools panel settings (format, quality, normalize, fades, ringtone) become
 *   ExportOptions via `exportOptionsFor()`; in keep mode the regions are converted with
 *   `keepToCuts()` (`cutsForExport()`), so every job uses the normal cut-based export path.
 * - Progress: loading FFmpeg maps to 0–20 % (loadFFmpeg reports only 0 and 100),
 *   the job to 20–100 %.
 * - Only one job at a time: every action is a no-op while another is running.
 * - Nothing to export (keep mode without keep regions, or everything cut) → an error toast
 *   before FFmpeg runs, not a tracked failure.
 * - Failures: tracked as `export_failed` (stage "load" for FFmpegLoadError) and shown as an
 *   error toast; out-of-memory errors get a "try a shorter or compressed file" message.
 * - Object URLs: download URLs are revoked right after the download starts; the preview
 *   URL is revoked when replaced and when the editor session unmounts (new file).
 *
 * New FFmpeg-backed actions should reuse `job()` and `reportFailure()` so progress,
 * analytics and errors stay consistent.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  detectSilence, exportAudio, loadFFmpeg, FFmpegLoadError, isLikelyOutOfMemory,
  formatInfo, totalLength, IPHONE_RINGTONE_MAX_SEC,
  type CutRegion, type ExportResult, type TimeRange,
} from "@/lib/ffmpeg";
import { trackExportCompleted, trackExportFailed, trackPreviewOpened, trackToolUsed } from "@/lib/analytics";
import { fileFormat, fileSizeMb, fmt } from "../editorUtils";
import { useToast } from "../toast/ToastProvider";
import {
  cutsForExport, exportOptionsFor, keptSegments, outputAnalytics, outputFileName, outputFormat,
  ringtoneTooLong, sectionCuts, sectionFileName, type ToolSettings,
} from "../toolSettings";
import type { RegionData, RegionMode } from "../types";
import type { SilenceSettings } from "./useToolSettings";

export const OUT_OF_MEMORY_MESSAGE =
  "Your browser ran out of memory processing this file. " +
  "Try a shorter clip, or convert it to a compressed format (e.g. MP3) first — " +
  "long WAV/FLAC files are the most likely to hit this limit.";

type JobKind = "export" | "preview" | "silence" | "section";

interface Options {
  file: File;
  duration: number;
  regions: RegionData[];
  mode: RegionMode;
  settings: ToolSettings;
  /** Download name without extension. */
  outputName: string;
}

/** Starts a browser download of `url` as `name`. */
function triggerDownload(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
}

/** Downloads a blob and revokes its URL. */
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  triggerDownload(url, name);
  // Revoke on the next tick: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** "+3.2 dB" for the success toast after a normalized export. */
function loudnessNote(result: ExportResult): string {
  if (!result.loudness) return "";
  const g = result.loudness.gainDb;
  return g === 0 ? " · loudness unchanged" : ` · loudness evened out (${g > 0 ? "+" : ""}${g.toFixed(1)} dB)`;
}

export function useFFmpegJob({ file, duration, regions, mode, settings, outputName }: Options) {
  const toast = useToast();

  const [exporting, setExporting]           = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportDone, setExportDone]         = useState(false);

  const [previewing, setPreviewing]           = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewUrl, setPreviewUrl]           = useState<string | null>(null);
  const [showPreview, setShowPreview]         = useState(false);
  const previewUrlRef = useRef<string | null>(null); // for the unmount cleanup
  /** The preview was rendered in this format (the download keeps it even if settings change). */
  const [previewFormat, setPreviewFormat] = useState(outputFormat(settings));

  const [detecting, setDetecting]           = useState(false);
  const [detectProgress, setDetectProgress] = useState(0);

  /** Key of the section being exported ("Export this section"), or null. */
  const [sectionKey, setSectionKey]           = useState<string | null>(null);
  const [sectionProgress, setSectionProgress] = useState(0);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const isProcessing = exporting || previewing || detecting || sectionKey !== null;
  const format = outputFormat(settings);
  const fileName = outputFileName(outputName, format);
  const cuts: CutRegion[] = cutsForExport(regions, duration, mode);

  /** Loads FFmpeg (first time only), then runs `work` with progress mapped to 20–100 %. */
  const job = useCallback(async <T,>(onProg: (p: number) => void, work: (p: (n: number) => void) => Promise<T>): Promise<T> => {
    await loadFFmpeg((p) => onProg(Math.round(p * 0.2)));
    return work((p) => onProg(20 + Math.round(p * 0.8)));
  }, []);

  /** Renders `jobCuts` (default: the current edit) with the current Tools settings. */
  const run = useCallback((onProg: (p: number) => void, jobCuts: CutRegion[] = cuts): Promise<ExportResult> =>
    job(onProg, (p) => exportAudio(file, jobCuts, duration, { ...exportOptionsFor(settings), onProgress: p })),
  [job, file, duration, cuts, settings]);

  /** Records a failed job and tells the user. */
  const reportFailure = useCallback((kind: JobKind, e: unknown) => {
    const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    trackExportFailed({
      stage: e instanceof FFmpegLoadError ? "load" : kind,
      format: fileFormat(file.name),
      sizeMB: fileSizeMb(file.size),
      durationSec: Math.round(duration),
      cutCount: regions.length,
      message,
      outputFormat: format,
      normalize: settings.normalize,
      mode,
    });
    const title = {
      export: "Export failed.", preview: "Preview failed.",
      silence: "Silence detection failed.", section: "Export failed.",
    }[kind];
    toast.error(title, isLikelyOutOfMemory(e) ? OUT_OF_MEMORY_MESSAGE : message);
  }, [file, duration, regions.length, toast, format, settings.normalize, mode]);

  /** False (with a toast) when the current edit would export nothing. */
  const checkSomethingToExport = useCallback((): boolean => {
    if (keptSegments(regions, duration, mode).length > 0) return true;
    toast.error("Nothing to export",
      mode === "keep"
        ? "Keep mode saves only the green regions — drag on the waveform to mark a part to keep."
        : "Every part of the audio is marked to cut.");
    return false;
  }, [regions, duration, mode, toast]);

  // ─── Preview ───────────────────────────────────────────────────────────────

  const handlePreview = useCallback(async () => {
    if (isProcessing || !checkSomethingToExport()) return;
    setPreviewing(true); setPreviewProgress(0);
    try {
      const result = await run(setPreviewProgress);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(result.blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setPreviewFormat(result.format);
      setShowPreview(true);
      trackPreviewOpened({ cutCount: regions.length });
    } catch (e) { reportFailure("preview", e); }
    finally { setPreviewing(false); }
  }, [isProcessing, checkSomethingToExport, run, regions.length, reportFailure]);

  const closePreview = useCallback(() => setShowPreview(false), []);

  /** "Download" in the preview modal — saves the already-rendered preview. */
  const downloadPreview = useCallback(() => {
    if (!previewUrl) return;
    const name = outputFileName(outputName, previewFormat);
    triggerDownload(previewUrl, name);
    setExportDone(true);
    setShowPreview(false);
    toast.success("Download started", name);
  }, [previewUrl, outputName, previewFormat, toast]);

  // ─── Export ────────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    if (isProcessing || !checkSomethingToExport()) return;
    const keptSec = totalLength(keptSegments(regions, duration, mode));
    if (ringtoneTooLong(settings, keptSec)) {
      toast.info("Longer than an iPhone ringtone",
        `Your ringtone is ${fmt(keptSec)} long. iPhone only lists ringtones up to ${IPHONE_RINGTONE_MAX_SEC} seconds — the file is exported anyway.`,
        { duration: 10000 });
    }
    setExporting(true); setExportProgress(0); setExportDone(false);
    try {
      const result = await run(setExportProgress);
      downloadBlob(result.blob, fileName);
      setExportDone(true);
      trackExportCompleted({
        cutCount: regions.length,
        durationSec: Math.round(duration),
        outputDurationSec: Math.round(result.durationSec),
        kind: "full",
        ...outputAnalytics(settings, mode),
      });
      toast.success("Export complete", fileName + loudnessNote(result));
    } catch (e) { reportFailure("export", e); }
    finally { setExporting(false); }
  }, [isProcessing, checkSomethingToExport, regions, duration, mode, settings, run, fileName, reportFailure, toast]);

  // ─── Remove silence ────────────────────────────────────────────────────────

  /** Runs silencedetect on the whole file. Returns the silent parts as cut ranges, or null on failure. */
  const handleDetectSilence = useCallback(async (opts: SilenceSettings): Promise<CutRegion[] | null> => {
    if (isProcessing) return null;
    setDetecting(true); setDetectProgress(0);
    try {
      return await job(setDetectProgress, (p) => detectSilence(file, { ...opts, duration, onProgress: p }));
    } catch (e) { reportFailure("silence", e); return null; }
    finally { setDetecting(false); }
  }, [isProcessing, job, file, duration, reportFailure]);

  // ─── Export one section ────────────────────────────────────────────────────

  /**
   * Exports only `section` (a keep region, or one kept part between cuts) as its own file,
   * named `<name>-NN.<ext>` by its position among `count` sections. One file — never a ZIP.
   */
  const exportSection = useCallback(async (section: TimeRange, index: number, count: number, key: string) => {
    if (isProcessing) return;
    const name = sectionFileName(outputName, index, count, format);
    setSectionKey(key); setSectionProgress(0);
    try {
      const result = await run(setSectionProgress, sectionCuts(section, duration));
      downloadBlob(result.blob, name);
      trackExportCompleted({
        cutCount: regions.length,
        durationSec: Math.round(duration),
        outputDurationSec: Math.round(result.durationSec),
        kind: "section",
        ...outputAnalytics(settings, mode),
      });
      trackToolUsed({ tool: "split", format, mode });
      toast.success("Section exported", `${name} · ${fmt(result.durationSec)}${loudnessNote(result)}`);
    } catch (e) { reportFailure("section", e); }
    finally { setSectionKey(null); }
  }, [isProcessing, outputName, format, run, duration, regions.length, mode, settings, reportFailure, toast]);

  return {
    exporting, exportProgress, exportDone,
    previewing, previewProgress, previewUrl, showPreview,
    previewExtension: formatInfo(previewFormat).extension,
    detecting, detectProgress,
    sectionKey, sectionProgress,
    isProcessing,
    format, fileName,
    handlePreview, closePreview, downloadPreview, handleExport,
    handleDetectSilence, exportSection,
    run, job, reportFailure,
  };
}

export type FFmpegJob = ReturnType<typeof useFFmpegJob>;
