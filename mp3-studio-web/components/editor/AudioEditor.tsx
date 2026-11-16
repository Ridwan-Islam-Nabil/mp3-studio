"use client";
/**
 * components/editor/AudioEditor.tsx — editor entry point (loaded by EditorLoader with
 * `ssr: false`).
 *
 * Holds only the loaded file and its object URL. Everything per-file lives in EditorSession,
 * which is keyed by the object URL so a new file starts a fresh session.
 *
 *   AudioEditor            file + object URL, upload analytics, toasts provider, page chrome
 *   ├─ DropZone            (no file yet)
 *   └─ EditorSession       hooks: useRegionHistory · useWaveSurfer · usePlayback · useFFmpegJob
 *      ├─ EditorToolbar · WaveformCard (ZoomBar, compact RegionList) · PlaybackBar
 *      │  (MarkToCut/Preview/Export buttons) · RegionList · PreviewModal
 */

import { useCallback, useState } from "react";
import { trackFileUploaded } from "@/lib/analytics";
import EditorSession from "./EditorSession";
import { fileFormat, fileSizeMb } from "./editorUtils";
import { ToastProvider } from "./toast/ToastProvider";
import { useToolSettings } from "./hooks/useToolSettings";
import { DropZone } from "./ui/DropZone";
import { ToolLinkIntro } from "./ui/ToolBanners";
import { EditorShell } from "./ui/EditorShell";

interface Source { file: File; url: string }

export default function AudioEditor() {
  const [source, setSource] = useState<Source | null>(null);
  // Tools panel settings + `?tool=` link: per visit, so they survive a file change.
  const tools = useToolSettings();

  const handleFile = useCallback((f: File) => {
    if (source) URL.revokeObjectURL(source.url);
    setSource({ file: f, url: URL.createObjectURL(f) });
    trackFileUploaded({
      format: fileFormat(f.name),
      fileSizeMb: fileSizeMb(f.size),
      durationSec: 0, // not known until WaveSurfer decodes the file
    });
  }, [source]);

  return (
    <ToastProvider>
      <EditorShell>
        {source
          ? <EditorSession key={source.url} file={source.file} fileUrl={source.url} onReplaceFile={handleFile} tools={tools} />
          : <>
              {tools.link && <ToolLinkIntro link={tools.link} />}
              <DropZone onFile={handleFile} />
            </>}
      </EditorShell>
    </ToastProvider>
  );
}
