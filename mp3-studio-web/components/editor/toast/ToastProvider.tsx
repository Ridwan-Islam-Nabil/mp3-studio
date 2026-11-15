/**
 * Minimal in-house toast notifications for the editor (no dependency).
 *
 *   <ToastProvider> … </ToastProvider>            wraps the editor (AudioEditor.tsx)
 *   const toast = useToast();
 *   toast.success("Exported song.mp3");
 *   toast.error("Export failed.", "details…");
 *
 * Toasts stack bottom-right, above the feedback button and above modals/fullscreen.
 * They auto-dismiss (success/info 5 s, errors 10 s), pause while hovered or focused, and have a
 * close button. Errors use role="alert" (announced immediately), others role="status"; the
 * viewport is always mounted with aria-live="polite" so screen readers pick up additions.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { C } from "../theme";

export type ToastKind = "success" | "error" | "info";

export interface ToastOptions {
  /** Auto-dismiss delay in ms. 0 = stay until closed. */
  duration?: number;
}

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  duration: number;
}

export interface ToastApi {
  show: (kind: ToastKind, title: string, message?: string, opts?: ToastOptions) => number;
  success: (title: string, message?: string, opts?: ToastOptions) => number;
  error: (title: string, message?: string, opts?: ToastOptions) => number;
  info: (title: string, message?: string, opts?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const DEFAULT_DURATION: Record<ToastKind, number> = { success: 5000, info: 5000, error: 10000 };

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() must be used inside <ToastProvider>.");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastApi["show"]>((kind, title, message, opts) => {
    const id = nextId.current++;
    const duration = opts?.duration ?? DEFAULT_DURATION[kind];
    setToasts((ts) => [...ts, { id, kind, title, message, duration }]);
    return id;
  }, []);

  const api = useMemo<ToastApi>(() => ({
    show,
    dismiss,
    success: (title, message, opts) => show("success", title, message, opts),
    error:   (title, message, opts) => show("error", title, message, opts),
    info:    (title, message, opts) => show("info", title, message, opts),
  }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-label="Notifications"
        data-testid="toast-viewport"
        style={{
          position: "fixed", right: 24, bottom: 84, zIndex: 1100,
          display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10,
          width: "min(380px, calc(100vw - 48px))", pointerEvents: "none",
        }}
      >
        {toasts.map((t) => <ToastCard key={t.id} toast={t} onDismiss={dismiss} />)}
      </div>
    </ToastContext.Provider>
  );
}

const ACCENT: Record<ToastKind, { color: string; icon: string }> = {
  success: { color: C.success, icon: "✓" },
  error:   { color: C.error,   icon: "!" },
  info:    { color: C.accent,  icon: "i" },
};

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const { color, icon } = ACCENT[toast.kind];

  // Auto-dismiss; the timer restarts after hover/focus ends.
  useEffect(() => {
    if (paused || toast.duration <= 0) return;
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [paused, toast.id, toast.duration, onDismiss]);

  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      data-testid={`toast-${toast.kind}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      style={{
        pointerEvents: "auto", width: "100%", boxSizing: "border-box",
        display: "flex", alignItems: "flex-start", gap: 12,
        background: "rgba(17,17,40,0.92)", backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: `1px solid ${C.border}`, borderLeft: `3px solid ${color}`,
        borderRadius: 12, padding: "12px 12px 12px 14px", boxShadow: C.shadow,
        color: C.text, fontSize: 13, lineHeight: 1.5,
      }}
    >
      <span aria-hidden style={{
        flexShrink: 0, width: 20, height: 20, borderRadius: "50%", marginTop: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: `${color}26`, color, fontSize: 12, fontWeight: 800,
      }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700 }}>{toast.title}</div>
        {toast.message && (
          <div style={{ color: C.muted, marginTop: 2, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
            {toast.message}
          </div>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        style={{
          flexShrink: 0, background: "none", border: "none", color: C.dim,
          fontSize: 18, lineHeight: 1, cursor: "pointer", padding: "0 2px",
        }}
      >×</button>
    </div>
  );
}
