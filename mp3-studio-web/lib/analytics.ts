/**
 * lib/analytics.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Typed PostHog event helpers.
 *
 * All calls are no-ops if NEXT_PUBLIC_POSTHOG_KEY is missing (e.g. local dev
 * without a .env.local file), so nothing breaks during development.
 *
 * SETUP:
 *   1. Sign up free at https://posthog.com
 *   2. Create a project — copy the Project API Key
 *   3. Create mp3-studio-web/.env.local:
 *        NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxx
 *        NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
 *   4. Deploy to Vercel → add the same env vars in Project Settings → Environment Variables
 */

import posthog from "posthog-js";

// ─── Init (called once from PostHogProvider) ─────────────────────────────────

export function initPostHog() {
  if (typeof window === "undefined") return;
  const key  = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
  if (!key) return; // no key = silent no-op

  posthog.init(key, {
    api_host:            host,
    capture_pageview:    true,   // auto page views
    capture_pageleave:   true,   // bounce detection
    session_recording:   { maskAllInputs: true }, // mask text inputs for privacy
    persistence:         "localStorage",
    autocapture:         false,  // only track what we explicitly call
  });
}

// ─── Typed event helpers ──────────────────────────────────────────────────────

function track(event: string, props?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try { posthog.capture(event, props); } catch { /* PostHog not init'd yet */ }
}

/** User dropped / picked an audio file */
export function trackFileUploaded(props: {
  format: string;       // "mp3", "aac", "wav", …
  fileSizeMb: number;
  durationSec: number;
}) {
  track("file_uploaded", props);
}

/** Output format of an export ("mp3" | "wav" | "m4a" | "m4r"). */
export type AnalyticsOutputFormat = "mp3" | "wav" | "m4a" | "m4r";

/** "cut" = regions are removed (default), "keep" = only the regions are kept (keep mode). */
export type AnalyticsRegionMode = "cut" | "keep";

/** User clicked Export (or "Export this section") and it completed */
export function trackExportCompleted(props: {
  cutCount:        number;  // number of regions (cut or keep, see `mode`)
  durationSec:     number;  // source audio length
  outputDurationSec: number;
  format?:    AnalyticsOutputFormat;  // output format
  normalize?: boolean;
  mode?:      AnalyticsRegionMode;
  fade?:      boolean;                // any fade in/out applied (incl. ringtone fades)
  ringtone?:  "iphone" | "android" | null;
  kind?:      "full" | "section";     // whole edit, or one section via "Export this section"
}) {
  track("export_completed", props);
}

/**
 * Loading FFmpeg, exporting, generating a preview, detecting silence or exporting one section
 * threw. `stage` is "load" when the FFmpeg core never finished loading.
 * `message` is truncated to 200 chars so stack-like errors don't bloat events.
 */
export function trackExportFailed(props: {
  stage:       "load" | "export" | "preview" | "silence" | "section";
  format:      string;  // source file extension, "mp3", "wav", …
  sizeMB:      number;
  durationSec: number;
  cutCount:    number;
  message:     string;
  outputFormat?: AnalyticsOutputFormat;
  normalize?:    boolean;
  mode?:         AnalyticsRegionMode;
}) {
  track("export_failed", { ...props, message: props.message.slice(0, 200) });
}

// ─── Tools (wave 4) ───────────────────────────────────────────────────────────

/**
 * One use of an editor tool. Only settings and counts — never file names or audio content.
 *   remove-silence  "Detect silence" finished (`cutsAdded` = regions added/changed)
 *   normalize       toggle changed
 *   convert         output format / quality changed
 *   fade            fade in / out toggled
 *   ringtone        ringtone mode turned on/off or device changed
 *   keep            keep mode switched (`conversion` = how existing regions were handled)
 *   split           "Export this section" used
 */
export type ToolUsedEvent =
  | { tool: "remove-silence"; cutsAdded: number; thresholdDb: number; minSilenceSec: number; mode: AnalyticsRegionMode }
  | { tool: "normalize"; enabled: boolean }
  | { tool: "convert"; format: AnalyticsOutputFormat; quality: "standard" | "high" }
  | { tool: "fade"; fadeIn: boolean; fadeOut: boolean }
  | { tool: "ringtone"; device: "iphone" | "android" | null }
  | { tool: "keep"; mode: AnalyticsRegionMode; conversion: "none" | "convert" | "relabel" }
  | { tool: "split"; format: AnalyticsOutputFormat; mode: AnalyticsRegionMode };

export function trackToolUsed(props: ToolUsedEvent) {
  track("tool_used", props);
}

/** The editor was opened from a shareable tool link (`/editor?tool=…`). */
export function trackToolLinkOpened(props: { tool: string; device?: string; format?: string }) {
  track("tool_link_opened", props);
}

/** User opened the Preview modal */
export function trackPreviewOpened(props: { cutCount: number }) {
  track("preview_opened", props);
}

/** A cut region was added (drag or Mark-to-Cut button) */
export function trackRegionCreated() {
  track("region_created");
}

/** Undo button clicked */
export function trackUndo() {
  track("undo_used");
}

/** Redo button clicked */
export function trackRedo() {
  track("redo_used");
}

/** User submitted the feedback widget */
export function trackFeedback(props: {
  sentiment: "positive" | "negative";
  message:   string;
  email?:    string;
}) {
  track("user_feedback", props);
}
