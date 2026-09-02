import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import FeedbackWidget from "@/components/FeedbackWidget";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "MP3 Studio",
  description: "Free online audio editor. Trim and export MP3 files in your browser with no sign-up.",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Does MP3 Studio upload my audio to a server?",
      acceptedAnswer: { "@type": "Answer", text: "No. All audio processing happens inside your browser using WebAssembly. Your files never leave your device." },
    },
    {
      "@type": "Question",
      name: "Can I remove multiple sections from one audio file?",
      acceptedAnswer: { "@type": "Answer", text: "Yes. You can mark as many cut regions as you want on the waveform and export everything in a single pass." },
    },
    {
      "@type": "Question",
      name: "Is there a file size limit?",
      acceptedAnswer: { "@type": "Answer", text: "No. Because processing runs in your browser there is no server-side size cap. Files up to several hundred MB work fine." },
    },
    {
      "@type": "Question",
      name: "What audio formats are supported?",
      acceptedAnswer: { "@type": "Answer", text: "MP3, WAV, M4A, AAC, FLAC, OGG, and OPUS. All formats are automatically converted to MP3 on export." },
    },
    {
      "@type": "Question",
      name: "Can I preview before downloading?",
      acceptedAnswer: { "@type": "Answer", text: "Yes. Click Preview to hear the result of your cuts before you download anything." },
    },
  ],
};

export const metadata: Metadata = {
  alternates: { canonical: "https://mp3-studio.vercel.app" },
  title: "MP3 Studio – Free Online Audio Editor & Trimmer | No Upload",
  description: "Trim, cut and export audio files entirely in your browser. No file upload, no sign-up, no size limit. Supports MP3, WAV, FLAC and more.",
};

const features = [
  { icon: "🔒", title: "Zero Upload Privacy", desc: "Your audio never touches a server. All cutting and exporting happens inside your browser via WebAssembly — completely private." },
  { icon: "✂️", title: "Multi-Cut in One Pass", desc: "Mark as many sections as you want to remove. Most tools limit you to one trim. We don't." },
  { icon: "🔬", title: "2000× Precision Zoom", desc: "Zoom in to millisecond accuracy on the waveform. Find the exact frame where the background noise starts." },
  { icon: "▶️", title: "Preview Before Export", desc: "Hear your edited audio before downloading. Know exactly what you'll get — no surprises." },
  { icon: "📐", title: "Real-Time Cursor & Playhead", desc: "Always see your exact timestamp while hovering or playing. No guessing, no typing in timecodes." },
  { icon: "💾", title: "No Size Limit, Free Forever", desc: "No trial, no watermark, no account. Works on files hundreds of MB in size." },
];

const steps = [
  { n: "1", title: "Drop your audio file", desc: "Drag and drop or browse. MP3, WAV, FLAC, M4A and more — all accepted." },
  { n: "2", title: "Mark cuts on the waveform", desc: "Drag over the parts you want to remove. Zoom in for surgical precision. Red = cut." },
  { n: "3", title: "Preview, then export", desc: "Listen to the result first. When you're happy, click Export MP3 — done." },
];

const comparisons = [
  { feature: "Files stay on your device", us: true, them: false },
  { feature: "Multiple cuts in one export", us: true, them: false },
  { feature: "Precision waveform zoom", us: true, them: false },
  { feature: "Preview before downloading", us: true, them: false },
  { feature: "No file size limit", us: true, them: false },
  { feature: "No account required", us: true, them: true },
  { feature: "Free to use", us: true, them: true },
];

const faqs = [
  { q: "Does MP3 Studio upload my audio to a server?", a: "No. All processing happens inside your browser using WebAssembly. Your files never leave your device." },
  { q: "Can I remove multiple sections from one file?", a: "Yes. Mark as many cut regions as you want on the waveform and export everything in one pass." },
  { q: "Is there a file size limit?", a: "No. Because processing runs in your browser there's no server-side cap. Large files work fine." },
  { q: "What formats are supported?", a: "MP3, WAV, M4A, AAC, FLAC, OGG, and OPUS. All converted to MP3 on export." },
  { q: "Can I preview before downloading?", a: "Yes. Click Preview to hear your edited result before you commit to downloading." },
  { q: "Does it work on mobile?", a: "The editor works best on desktop Chrome or Edge. Mobile support is limited by browser WebAssembly performance." },
];

export default function LandingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <FeedbackWidget />

      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>

        {/* ── Navbar ── */}
        <nav style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px clamp(16px, 5vw, 64px)",
          borderBottom: "1px solid var(--card-border)",
          background: "rgba(6,6,15,0.85)", backdropFilter: "blur(12px)",
          position: "sticky", top: 0, zIndex: 100,
        }}>
          <span style={{ fontWeight: 800, fontSize: 18 }}>
            <span className="gradient-text">MP3</span>{" "}
            <span style={{ color: "var(--text)" }}>Studio</span>
          </span>
          <Link href="/editor" className="btn btn-primary" style={{ fontSize: 13 }}>
            Open Editor →
          </Link>
        </nav>

        {/* ── Hero ── */}
        <section style={{
          textAlign: "center",
          padding: "clamp(60px, 10vw, 110px) clamp(16px, 5vw, 64px) 72px",
          maxWidth: 860, margin: "0 auto",
        }}>
          <div style={{
            display: "inline-block",
            background: "var(--primary-dim)", border: "1px solid var(--primary)",
            color: "var(--primary-light)", borderRadius: 20,
            padding: "4px 14px", fontSize: 12, fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 24,
          }}>
            Free · No upload · Runs in your browser
          </div>

          <h1 style={{
            fontSize: "clamp(32px, 6vw, 62px)", fontWeight: 900,
            lineHeight: 1.1, margin: "0 0 20px",
          }}>
            Trim audio{" "}
            <span className="gradient-text">without uploading it anywhere</span>
          </h1>

          <p style={{
            fontSize: "clamp(15px, 2vw, 18px)", color: "var(--text-muted)",
            maxWidth: 580, margin: "0 auto 36px", lineHeight: 1.7,
          }}>
            MP3 Studio is a professional waveform editor that runs entirely in your browser.
            Your files stay on your device — always. Cut multiple sections, zoom to millisecond
            precision, preview your result, and export a clean MP3 in seconds.
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/editor" className="btn btn-primary" style={{ fontSize: 16, padding: "14px 32px" }}>
              Start Editing — It&apos;s Free
            </Link>
            <a href="#how-it-works" className="btn btn-ghost" style={{ fontSize: 16, padding: "14px 32px" }}>
              See How It Works
            </a>
          </div>

          <div style={{
            marginTop: 48, display: "flex", gap: 28, justifyContent: "center",
            flexWrap: "wrap", color: "var(--text-muted)", fontSize: 13,
          }}>
            {["No server upload", "No watermark", "No file size limit", "No account needed"].map((t) => (
              <span key={t}><span style={{ color: "var(--success)", marginRight: 6 }}>✓</span>{t}</span>
            ))}
          </div>
        </section>

        {/* ── Screenshot 1: Main editor ── */}
        <section style={{ padding: "0 clamp(16px, 5vw, 64px) 80px", maxWidth: 1200, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: "clamp(22px, 3.5vw, 32px)", fontWeight: 800, marginBottom: 12 }}>
            Multi-cut waveform editor
          </h2>
          <p style={{ textAlign: "center", color: "var(--text-muted)", marginBottom: 32, fontSize: 15 }}>
            Mark multiple sections to remove in a single pass — no re-uploading, no repeating the process.
          </p>
          <div className="glass" style={{ padding: 8, borderRadius: 14, overflow: "hidden" }}>
            <Image
              src="/screenshots/editor-main.png"
              alt="MP3 Studio waveform editor showing multiple cut regions on an audio file"
              width={1200} height={600}
              style={{ width: "100%", height: "auto", borderRadius: 8, display: "block" }}
              priority
            />
          </div>
          <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 13, marginTop: 12 }}>
            Visual waveform editor — drag to mark cuts, see everything in real time
          </p>
        </section>

        {/* ── Features ── */}
        <section style={{ padding: "80px clamp(16px, 5vw, 64px)", maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 800, marginBottom: 12 }}>
            Built different from other online trimmers
          </h2>
          <p style={{ textAlign: "center", color: "var(--text-muted)", marginBottom: 48, fontSize: 15 }}>
            Most tools are simple crop-and-download. MP3 Studio is a real editor.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
            {features.map((f) => (
              <div key={f.title} className="glass" style={{ padding: 24 }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
                <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>{f.title}</h3>
                <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14, lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Screenshot 2: Zoom ── */}
        <section style={{ padding: "0 clamp(16px, 5vw, 64px) 80px", maxWidth: 1200, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: "clamp(22px, 3.5vw, 32px)", fontWeight: 800, marginBottom: 12 }}>
            Zoom in to millisecond precision
          </h2>
          <p style={{ textAlign: "center", color: "var(--text-muted)", marginBottom: 32, fontSize: 15 }}>
            Up to 2000× zoom — find the exact frame where a sound starts or ends.
            Rare in any online tool.
          </p>
          <div className="glass" style={{ padding: 8, borderRadius: 14, overflow: "hidden" }}>
            <Image
              src="/screenshots/editor-zoom.png"
              alt="MP3 Studio zoomed in to 2000x precision showing exact waveform detail"
              width={1200} height={600}
              style={{ width: "100%", height: "auto", borderRadius: 8, display: "block" }}
            />
          </div>
          <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 13, marginTop: 12 }}>
            2000× zoom — the badge bottom-right shows the current zoom level
          </p>
        </section>

        {/* ── Screenshot 3: Preview modal ── */}
        <section style={{ padding: "0 clamp(16px, 5vw, 64px) 80px", maxWidth: 800, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: "clamp(22px, 3.5vw, 32px)", fontWeight: 800, marginBottom: 12 }}>
            Preview before you download
          </h2>
          <p style={{ textAlign: "center", color: "var(--text-muted)", marginBottom: 32, fontSize: 15 }}>
            Hear the final result first. No wasted downloads, no second-guessing.
          </p>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div className="glass" style={{ padding: 8, borderRadius: 14, overflow: "hidden", maxWidth: 500, width: "100%" }}>
              <Image
                src="/screenshots/preview-modal.png"
                alt="MP3 Studio preview modal showing playback controls before downloading"
                width={500} height={300}
                style={{ width: "100%", height: "auto", borderRadius: 8, display: "block" }}
              />
            </div>
          </div>
        </section>

        {/* ── Comparison table ── */}
        <section style={{ padding: "80px clamp(16px, 5vw, 64px)", maxWidth: 700, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: "clamp(22px, 3.5vw, 32px)", fontWeight: 800, marginBottom: 12 }}>
            How we compare
          </h2>
          <p style={{ textAlign: "center", color: "var(--text-muted)", marginBottom: 40, fontSize: 15 }}>
            vs. typical online audio trimmers
          </p>

          <div className="glass" style={{ overflow: "hidden", borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <th style={{ padding: "14px 20px", textAlign: "left", color: "var(--text-muted)", fontWeight: 600 }}>Feature</th>
                  <th style={{ padding: "14px 20px", textAlign: "center", color: "var(--primary-light)", fontWeight: 700 }}>MP3 Studio</th>
                  <th style={{ padding: "14px 20px", textAlign: "center", color: "var(--text-dim)", fontWeight: 600 }}>Other tools</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((row, i) => (
                  <tr key={row.feature} style={{ borderBottom: i < comparisons.length - 1 ? "1px solid var(--card-border)" : "none" }}>
                    <td style={{ padding: "13px 20px", color: "var(--text)" }}>{row.feature}</td>
                    <td style={{ padding: "13px 20px", textAlign: "center", fontSize: 18 }}>
                      {row.us ? <span style={{ color: "var(--success)" }}>✓</span> : <span style={{ color: "var(--error)" }}>✗</span>}
                    </td>
                    <td style={{ padding: "13px 20px", textAlign: "center", fontSize: 18 }}>
                      {row.them ? <span style={{ color: "var(--success)" }}>✓</span> : <span style={{ color: "var(--error)" }}>✗</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── How It Works ── */}
        <section id="how-it-works" style={{ padding: "80px clamp(16px, 5vw, 64px)", maxWidth: 860, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 800, marginBottom: 48 }}>
            How it works
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {steps.map((s) => (
              <div key={s.n} className="glass" style={{ padding: 24, display: "flex", gap: 20, alignItems: "flex-start" }}>
                <div style={{
                  minWidth: 40, height: 40, borderRadius: "50%",
                  background: "var(--primary-dim)", border: "2px solid var(--primary)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, color: "var(--primary-light)", fontSize: 16,
                }}>
                  {s.n}
                </div>
                <div>
                  <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700 }}>{s.title}</h3>
                  <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14, lineHeight: 1.6 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ ── */}
        <section style={{ padding: "80px clamp(16px, 5vw, 64px)", maxWidth: 760, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 800, marginBottom: 48 }}>
            Frequently asked questions
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {faqs.map((f) => (
              <div key={f.q} className="glass" style={{ padding: "20px 24px" }}>
                <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{f.q}</h3>
                <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14, lineHeight: 1.65 }}>{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section style={{ textAlign: "center", padding: "80px clamp(16px, 5vw, 64px) 120px" }}>
          <div className="glass" style={{ maxWidth: 600, margin: "0 auto", padding: "48px 32px" }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 28, fontWeight: 800 }}>
              Ready to trim your audio?
            </h2>
            <p style={{ color: "var(--text-muted)", marginBottom: 28, lineHeight: 1.6 }}>
              No sign-up. No server. Your files stay on your device — always.
            </p>
            <Link href="/editor" className="btn btn-primary" style={{ fontSize: 16, padding: "14px 32px" }}>
              Open Editor — Free →
            </Link>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer style={{
          borderTop: "1px solid var(--card-border)",
          padding: "24px clamp(16px, 5vw, 64px)",
          textAlign: "center", color: "var(--text-dim)", fontSize: 13,
        }}>
          MP3 Studio — Free online audio editor. No server. No sign-up. No size limit.
          <br />
          <span style={{ marginTop: 6, display: "inline-block" }}>
            © {new Date().getFullYear()} RIN Production. All rights reserved.
          </span>
        </footer>
      </div>
    </>
  );
}
