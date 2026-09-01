import Link from "next/link";
import type { Metadata } from "next";

// JSON-LD structured data — helps Google understand what this page is
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "MP3 Studio",
  description:
    "Free online audio editor. Trim and export MP3 files in your browser with no sign-up.",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export const metadata: Metadata = {
  alternates: { canonical: "https://mp3studio.app" },
};

// Feature list shown in the features section
const features = [
  {
    icon: "🔒",
    title: "100% Private",
    desc: "Your files never leave your device. All processing happens inside your browser.",
  },
  {
    icon: "⚡",
    title: "No Sign-Up",
    desc: "Open the editor and start trimming immediately. No account, no email, no wait.",
  },
  {
    icon: "🎚️",
    title: "Visual Waveform",
    desc: "Drag to select the parts you want to remove. See exactly what you're cutting.",
  },
  {
    icon: "🎵",
    title: "All Formats",
    desc: "MP3, WAV, M4A, AAC, FLAC, OGG, OPUS — all auto-converted to MP3 on export.",
  },
  {
    icon: "✂️",
    title: "Multi-Cut",
    desc: "Mark multiple sections to remove in one pass. Preview before you export.",
  },
  {
    icon: "💾",
    title: "Free Forever",
    desc: "The core tool is always free. No trial, no watermark, no size limit.",
  },
];

// Steps for the How It Works section
const steps = [
  { n: "1", title: "Upload your audio", desc: "Drag and drop or click to browse. MP3, WAV, FLAC and more." },
  { n: "2", title: "Mark cuts on the waveform", desc: "Drag over sections to remove. Red = cut. Everything else is kept." },
  { n: "3", title: "Export your MP3", desc: "Click Export. Your browser processes everything and downloads the file." },
];

export default function LandingPage() {
  return (
    <>
      {/* Structured data for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
        {/* ── Navbar ── */}
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px clamp(16px, 5vw, 64px)",
            borderBottom: "1px solid var(--card-border)",
            background: "rgba(6,6,15,0.8)",
            backdropFilter: "blur(12px)",
            position: "sticky",
            top: 0,
            zIndex: 100,
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 18 }}>
            <span className="gradient-text">MP3</span>{" "}
            <span style={{ color: "var(--text)" }}>Studio</span>
          </span>
          <Link href="/editor" className="btn btn-primary" style={{ fontSize: 13 }}>
            Open Editor →
          </Link>
        </nav>

        {/* ── Hero ── */}
        <section
          style={{
            textAlign: "center",
            padding: "clamp(60px, 12vw, 120px) clamp(16px, 5vw, 64px) 80px",
            maxWidth: 860,
            margin: "0 auto",
          }}
        >
          <div
            style={{
              display: "inline-block",
              background: "var(--primary-dim)",
              border: "1px solid var(--primary)",
              color: "var(--primary-light)",
              borderRadius: 20,
              padding: "4px 14px",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 24,
            }}
          >
            Free · No sign-up · Runs in your browser
          </div>

          <h1
            style={{
              fontSize: "clamp(32px, 6vw, 64px)",
              fontWeight: 900,
              lineHeight: 1.1,
              margin: "0 0 20px",
            }}
          >
            Trim audio files{" "}
            <span className="gradient-text">without uploading them</span>
          </h1>

          <p
            style={{
              fontSize: "clamp(15px, 2vw, 18px)",
              color: "var(--text-muted)",
              maxWidth: 560,
              margin: "0 auto 36px",
              lineHeight: 1.7,
            }}
          >
            MP3 Studio is a visual audio editor that runs entirely in your browser.
            Cut silences, remove intros, export clean MP3s — your files never touch a
            server.
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/editor" className="btn btn-primary" style={{ fontSize: 16, padding: "14px 32px" }}>
              Start Editing — It&apos;s Free
            </Link>
            <a href="#how-it-works" className="btn btn-ghost" style={{ fontSize: 16, padding: "14px 32px" }}>
              See How It Works
            </a>
          </div>

          {/* Social proof bar */}
          <div
            style={{
              marginTop: 48,
              display: "flex",
              gap: 32,
              justifyContent: "center",
              flexWrap: "wrap",
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            {["No server upload", "No watermark", "No file size limit", "No account needed"].map((t) => (
              <span key={t}>
                <span style={{ color: "var(--success)", marginRight: 6 }}>✓</span>
                {t}
              </span>
            ))}
          </div>
        </section>

        {/* ── Features ── */}
        <section
          style={{
            padding: "80px clamp(16px, 5vw, 64px)",
            maxWidth: 1100,
            margin: "0 auto",
          }}
        >
          <h2
            style={{
              textAlign: "center",
              fontSize: "clamp(24px, 4vw, 36px)",
              fontWeight: 800,
              marginBottom: 48,
            }}
          >
            Everything you need, nothing you don&apos;t
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 20,
            }}
          >
            {features.map((f) => (
              <div key={f.title} className="glass" style={{ padding: 24 }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
                <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>{f.title}</h3>
                <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14, lineHeight: 1.6 }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How It Works ── */}
        <section
          id="how-it-works"
          style={{
            padding: "80px clamp(16px, 5vw, 64px)",
            maxWidth: 860,
            margin: "0 auto",
          }}
        >
          <h2
            style={{
              textAlign: "center",
              fontSize: "clamp(24px, 4vw, 36px)",
              fontWeight: 800,
              marginBottom: 48,
            }}
          >
            How it works
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {steps.map((s) => (
              <div
                key={s.n}
                className="glass"
                style={{ padding: 24, display: "flex", gap: 20, alignItems: "flex-start" }}
              >
                <div
                  style={{
                    minWidth: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "var(--primary-dim)",
                    border: "2px solid var(--primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    color: "var(--primary-light)",
                    fontSize: 16,
                  }}
                >
                  {s.n}
                </div>
                <div>
                  <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700 }}>{s.title}</h3>
                  <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14, lineHeight: 1.6 }}>
                    {s.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section
          style={{
            textAlign: "center",
            padding: "80px clamp(16px, 5vw, 64px) 120px",
          }}
        >
          <div className="glass" style={{ maxWidth: 600, margin: "0 auto", padding: "48px 32px" }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 28, fontWeight: 800 }}>
              Ready to trim your audio?
            </h2>
            <p style={{ color: "var(--text-muted)", marginBottom: 28, lineHeight: 1.6 }}>
              No sign-up. No server. Just open the editor and start.
            </p>
            <Link href="/editor" className="btn btn-primary" style={{ fontSize: 16, padding: "14px 32px" }}>
              Open Editor — Free →
            </Link>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer
          style={{
            borderTop: "1px solid var(--card-border)",
            padding: "24px clamp(16px, 5vw, 64px)",
            textAlign: "center",
            color: "var(--text-dim)",
            fontSize: 13,
          }}
        >
          MP3 Studio — Free online audio editor. No server. No sign-up.
        </footer>
      </div>
    </>
  );
}
