"use client";
/**
 * components/FeedbackWidget.tsx
 *
 * Fixed bottom-right feedback button.
 * Opens a modal with thumbs up/down, a text area, and an optional email field.
 * On submit, the feedback is sent to PostHog as a `user_feedback` event —
 * no separate backend or database needed.
 */

import { useState } from "react";
import { trackFeedback } from "@/lib/analytics";

const C = {
  bg:      "#06060f",
  card:    "#111128",
  border:  "#1e1e40",
  surface: "#0d0d1c",
  primary: "#7c3aed",
  accent:  "#06b6d4",
  text:    "#f1f5f9",
  muted:   "#94a3b8",
  dim:     "#475569",
  success: "#10b981",
};

export default function FeedbackWidget() {
  const [open, setOpen]           = useState(false);
  const [sentiment, setSentiment] = useState<"positive" | "negative" | null>(null);
  const [message, setMessage]     = useState("");
  const [email, setEmail]         = useState("");
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setSentiment(null); setMessage(""); setEmail(""); setSubmitted(false);
  };

  const close = () => { setOpen(false); setTimeout(reset, 300); };

  const submit = () => {
    if (!sentiment && !message.trim()) return;
    trackFeedback({
      sentiment: sentiment ?? "positive",
      message:   message.trim(),
      email:     email.trim() || undefined,
    });
    setSubmitted(true);
    setTimeout(close, 2200);
  };

  return (
    <>
      {/* ── Trigger button ── */}
      <button
        onClick={() => setOpen(true)}
        title="Send feedback"
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 500,
          background: C.card, border: `1px solid ${C.border}`,
          color: C.muted, borderRadius: 24, padding: "9px 16px",
          fontSize: 13, fontWeight: 600, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 7,
          boxShadow: "0 4px 20px rgba(0,0,0,.5)",
          transition: "all .15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = C.primary;
          (e.currentTarget as HTMLButtonElement).style.color = C.text;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = C.border;
          (e.currentTarget as HTMLButtonElement).style.color = C.muted;
        }}
      >
        💬 Feedback
      </button>

      {/* ── Modal ── */}
      {open && (
        <div
          onClick={close}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 14, width: "min(92vw, 400px)",
              padding: 24, boxShadow: "0 8px 40px rgba(0,0,0,.7)",
            }}
          >
            {submitted ? (
              /* ── Thank you state ── */
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🙏</div>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 6px" }}>Thanks for your feedback!</p>
                <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>It helps make MP3 Studio better.</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: C.text }}>Share your feedback</h3>
                  <button onClick={close} style={{ background: "none", border: "none", color: C.muted, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
                </div>

                {/* Thumbs */}
                <p style={{ fontSize: 12, color: C.muted, margin: "0 0 10px", fontWeight: 600 }}>How's your experience?</p>
                <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
                  {(["positive", "negative"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSentiment(s)}
                      style={{
                        flex: 1, padding: "10px 0", borderRadius: 9, fontSize: 22, cursor: "pointer",
                        border: `2px solid ${sentiment === s ? (s === "positive" ? C.success : "#ef4444") : C.border}`,
                        background: sentiment === s
                          ? (s === "positive" ? "rgba(16,185,129,.12)" : "rgba(239,68,68,.12)")
                          : C.surface,
                        transition: "all .15s",
                      }}
                    >
                      {s === "positive" ? "👍" : "👎"}
                    </button>
                  ))}
                </div>

                {/* Message */}
                <p style={{ fontSize: 12, color: C.muted, margin: "0 0 6px", fontWeight: 600 }}>What's on your mind? <span style={{ color: C.dim, fontWeight: 400 }}>(optional)</span></p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="A feature you'd love, something that confused you, or just a note…"
                  rows={3}
                  style={{
                    width: "100%", background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: "9px 12px", color: C.text, fontSize: 13,
                    resize: "vertical", outline: "none", fontFamily: "inherit",
                    boxSizing: "border-box", marginBottom: 12,
                  }}
                />

                {/* Email */}
                <p style={{ fontSize: 12, color: C.muted, margin: "0 0 6px", fontWeight: 600 }}>
                  Your email <span style={{ color: C.dim, fontWeight: 400 }}>(optional — if you want a reply)</span>
                </p>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={{
                    width: "100%", background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 13,
                    outline: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: 18,
                  }}
                />

                {/* Submit */}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={close} style={{
                    background: "transparent", border: `1px solid ${C.border}`, color: C.muted,
                    borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer",
                  }}>Cancel</button>
                  <button
                    onClick={submit}
                    disabled={!sentiment && !message.trim()}
                    style={{
                      background: (!sentiment && !message.trim()) ? C.surface : C.primary,
                      border: "none", color: "#fff", borderRadius: 8, padding: "8px 20px",
                      fontSize: 13, fontWeight: 700, cursor: (!sentiment && !message.trim()) ? "not-allowed" : "pointer",
                      opacity: (!sentiment && !message.trim()) ? 0.5 : 1, transition: "all .15s",
                    }}
                  >
                    Send feedback
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
