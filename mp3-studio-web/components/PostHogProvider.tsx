"use client";
/**
 * components/PostHogProvider.tsx
 *
 * Initialises PostHog once on the client side.
 * Wraps the app in layout.tsx so every page is covered.
 */

import { useEffect } from "react";
import { initPostHog } from "@/lib/analytics";

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  return <>{children}</>;
}
