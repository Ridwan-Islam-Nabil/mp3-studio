/**
 * Tools panel settings for the whole visit (used by AudioEditor, so they survive a file change).
 *
 * - On first render: reads `?tool=` (toolParams.ts) and the stored settings (toolSettings.ts),
 *   and applies the link on top. The editor is client-only (`ssr: false`), so reading
 *   `window.location` in the state initializer is safe and avoids a flash of the defaults.
 * - `update(patch)` changes the settings and stores only the changed persisted keys, so values a
 *   link set are not written to localStorage unless the user changes them.
 * - Remove-silence options (threshold, minimum length) live here too, but are not stored.
 */

import { useCallback, useEffect, useState } from "react";
import { trackToolLinkOpened } from "@/lib/analytics";
import { DEFAULT_SILENCE_OPTIONS } from "@/lib/audio/silence";
import { parseToolParams, type ToolLink } from "../toolParams";
import { initialModeForLink, loadToolSettings, saveToolSettings, settingsForLink, type ToolSettings } from "../toolSettings";
import { getStorage } from "./browserStorage";

export interface SilenceSettings {
  thresholdDb: number;
  minSilenceSec: number;
}

export const DEFAULT_SILENCE_SETTINGS: SilenceSettings = {
  thresholdDb: DEFAULT_SILENCE_OPTIONS.thresholdDb,
  minSilenceSec: DEFAULT_SILENCE_OPTIONS.minSilenceSec,
};

export function useToolSettings() {
  const [link] = useState<ToolLink | null>(() =>
    parseToolParams(typeof window === "undefined" ? null : window.location.search));
  const [settings, setSettings] = useState<ToolSettings>(() => settingsForLink(loadToolSettings(getStorage()), link));
  const [silence, setSilence] = useState<SilenceSettings>(DEFAULT_SILENCE_SETTINGS);

  useEffect(() => {
    if (link) trackToolLinkOpened({ tool: link.tool, device: link.device, format: link.format });
  }, [link]);

  const update = useCallback((patch: Partial<ToolSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    saveToolSettings(getStorage(), patch);
  }, []);

  return {
    /** The `?tool=` link this visit was opened with, or null. */
    link,
    /** Tool to highlight in the UI. */
    highlight: link?.tool ?? null,
    /** Mode a new file session starts in (`?tool=keep` → keep). */
    initialMode: initialModeForLink(link),
    settings,
    update,
    silence,
    setSilence,
  };
}

export type ToolSettingsApi = ReturnType<typeof useToolSettings>;
