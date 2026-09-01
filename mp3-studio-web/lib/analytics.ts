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

/** User clicked Export MP3 and it completed */
export function trackExportCompleted(props: {
  cutCount:        number;  // number of cut regions
  durationSec:     number;  // source audio length
  outputDurationSec: number;
}) {
  track("export_completed", props);
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
