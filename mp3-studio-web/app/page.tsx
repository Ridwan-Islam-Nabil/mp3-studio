import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import FeedbackWidget from "@/components/FeedbackWidget";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "MP3 Studio",
  description: "Free online MP3 trimmer with multiple cuts — remove multiple sections from audio in one pass. No upload, no software, no sign-up. Works with MP3, WAV, FLAC, M4A.",
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
      name: "How do I cut multiple parts from an MP3 online for free?",
      acceptedAnswer: { "@type": "Answer", text: "Open MP3 Studio, drop your file, then drag on the waveform to mark every section you want to remove. You can add as many cut regions as you need. When done, click Export MP3 and all the cuts are applied in one pass — no re-uploading between cuts. It's completely free and runs in your browser." },
    },
    {
      "@type": "Question",
      name: "Is there a free audio trimmer that doesn't upload my file?",
      acceptedAnswer: { "@type": "Answer", text: "Yes — MP3 Studio processes everything locally inside your browser using WebAssembly. Your audio file never leaves your device and is never sent to any server. This makes it suitable for private recordings, confidential interviews, and sensitive audio." },
    },
    {
      "@type": "Question",
      name: "How do I remove a section from the middle of an audio file online?",
      acceptedAnswer: { "@type": "Answer", text: "In MP3 Studio, drag over the middle section you want to delete on the waveform — it turns red to show it will be cut. You can zoom in up to 2000× for precision. Click Export and the middle section is removed, leaving one clean joined file. No software download needed." },
    },
    {
      "@type": "Question",
      name: "What is the best free MP3 trimmer with no software required?",
      acceptedAnswer: { "@type": "Answer", text: "MP3 Studio is a browser-based audio trimmer that requires no software download or installation. It supports multiple cuts in one session, millisecond-precision zoom, and previewing the result before downloading. It works in Chrome and Edge on Windows and Mac." },
    },
    {
      "@type": "Question",
      name: "Can I delete part of a WAV or FLAC file online free?",
      acceptedAnswer: { "@type": "Answer", text: "Yes. MP3 Studio accepts WAV, FLAC, M4A, AAC, OGG, OPUS, and MP3 files. You can remove any number of sections and export a clean MP3. All processing runs in your browser — no upload required." },
    },
    {
      "@type": "Question",
      name: "How do I cut out an ad break from a podcast MP3?",
      acceptedAnswer: { "@type": "Answer", text: "Drop your podcast MP3 into MP3 Studio, find the ad break on the waveform, drag to select it, and it turns red. If there are multiple ad breaks, mark all of them. Click Export and you get one clean file with all ads removed. Free, no upload, no account." },
    },
    {
      "@type": "Question",
      name: "How is this different from Audacity?",
      acceptedAnswer: { "@type": "Answer", text: "Audacity is desktop software you download and install. MP3 Studio runs entirely in your browser — no installation, no setup, no learning curve. Open the page, drop your file, mark cuts, export. Done in under a minute." },
    },
    {
      "@type": "Question",
      name: "Is there a file size limit?",
      acceptedAnswer: { "@type": "Answer", text: "No. Because processing runs in your browser there is no server-side size cap. Files up to several hundred MB work fine on a modern desktop." },
    },
  ],
};

export const metadata: Metadata = {
  alternates: { canonical: "https://mp3-studio.vercel.app" },
  title: "Online MP3 Trimmer — Multiple Cuts, No Upload, Free",
  description: "Remove multiple sections from any MP3, WAV, or FLAC file online — free, no upload, no software. Mark every part to delete, preview the result, and export one clean file. No sign-up. Works in your browser.",
};

const features = [
  { icon: "✂️", title: "Multiple cuts, one export", desc: "Mark every section to remove — ad breaks, mistakes, silence — and export once. No re-uploading between cuts. Most online trimmers limit you to one trim. We don't." },
  { icon: "🔒", title: "No upload, no software", desc: "Your audio file never touches a server. Everything runs in your browser using WebAssembly. No Audacity, no install, no account — just open the page and trim." },
  { icon: "🔬", title: "Millisecond precision zoom", desc: "Up to 2000× zoom on the waveform. Find the exact frame where a background noise or ad starts. Rare in any free online audio trimmer." },
  { icon: "▶️", title: "Preview before downloading", desc: "Hear the result of your cuts before you download anything. Know exactly what you'll get — no surprises, no wasted exports." },
  { icon: "📐", title: "Delete any section, not just trim edges", desc: "Remove a section from the middle of your file, the beginning, the end — anywhere. Red regions get deleted; everything else is kept and joined." },
  { icon: "💾", title: "Free forever, no file size limit", desc: "No trial, no watermark, no account needed. Works on MP3, WAV, FLAC, M4A, OGG files — no size cap because processing runs on your device." },
];

const steps = [
  { n: "1", title: "Drop your audio file — any format", desc: "Drag and drop your MP3, WAV, FLAC, M4A, OGG or OPUS file. No upload to a server — it opens directly in your browser." },
  { n: "2", title: "Mark every section to remove", desc: "Drag on the waveform to mark parts to delete. Add as many cut regions as you want. Zoom in up to 2000× for millisecond precision. Red = cut." },
  { n: "3", title: "Preview the result, then export", desc: "Click Preview to hear your edited audio first. When it sounds right, click Export MP3. All cuts applied in one clean pass." },
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
  { q: "How do I cut multiple parts from an MP3 online for free?", a: "Drop your file into MP3 Studio, drag on the waveform to mark every section to remove, then click Export. All cuts apply in one pass — no re-uploading, no repeating the process. It's free and runs entirely in your browser." },
  { q: "Is there a free audio trimmer that doesn't upload my file?", a: "Yes. MP3 Studio processes everything locally in your browser using WebAssembly. Your audio never leaves your device and is never sent to any server." },
  { q: "How do I remove a section from the middle of an audio file?", a: "Drag over the middle section on the waveform — it turns red. You can zoom in up to 2000× for precision. Click Export and the section is removed, leaving one seamlessly joined file." },
  { q: "How do I cut out an ad break from a podcast MP3?", a: "Drop your podcast into MP3 Studio, find each ad break on the waveform, and drag to mark them red. If there are multiple ad breaks, mark all of them. One export removes everything at once. Free, no account." },
  { q: "Can I delete a WAV, FLAC or M4A file online free?", a: "Yes. MP3 Studio accepts WAV, FLAC, M4A, AAC, OGG, OPUS and MP3. Remove any number of sections and export a clean MP3. No upload required." },
  { q: "What's the difference between this and Audacity?", a: "Audacity is desktop software you download and install. MP3 Studio runs in your browser — no installation, no setup. Open the page, drop your file, mark cuts, export. Done in under a minute." },
  { q: "Is there a file size limit?", a: "No. Processing runs on your device so there's no server-side cap. Files hundreds of MB in size work fine on a modern desktop browser." },
  { q: "Does it work on mobile?", a: "The editor works best on desktop Chrome or Edge. Mobile works for basic edits but the precision zoom features are easier to use with a mouse." },
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
            Free · No upload · No software · No sign-up
          </div>

          <h1 style={{
            fontSize: "clamp(32px, 6vw, 62px)", fontWeight: 900,
            lineHeight: 1.1, margin: "0 0 20px",
          }}>
            Online MP3 trimmer with{" "}
            <span className="gradient-text">multiple cuts — free, no upload</span>
          </h1>

          <p style={{
            fontSize: "clamp(15px, 2vw, 18px)", color: "var(--text-muted)",
            maxWidth: 600, margin: "0 auto 36px", lineHeight: 1.7,
          }}>
            Remove multiple sections from your MP3, WAV, or FLAC file in one pass —
            ad breaks, mistakes, silence — all deleted in a single export.
            No software to download, nothing uploaded to any server. Free forever.
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
            {["No server upload", "No software install", "No file size limit", "No account needed"].map((t) => (
              <span key={t}><span style={{ color: "var(--success)", marginRight: 6 }}>✓</span>{t}</span>
            ))}
          </div>
        </section>

        {/* ── Screenshot 1: Main editor ── */}
        <section style={{ padding: "0 clamp(16px, 5vw, 64px) 80px", maxWidth: 1200, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: "clamp(22px, 3.5vw, 32px)", fontWeight: 800, marginBottom: 12 }}>
            Cut multiple parts from audio — no re-uploading
          </h2>
          <p style={{ textAlign: "center", color: "var(--text-muted)", marginBottom: 32, fontSize: 15 }}>
            Mark every section to remove in one session and export once. No repeating the process.
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
            Free audio trimmer — no upload, no software, multiple cuts
          </h2>
          <p style={{ textAlign: "center", color: "var(--text-muted)", marginBottom: 48, fontSize: 15 }}>
            Most online trimmers are simple crop-and-download. MP3 Studio handles the real editing jobs.
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
            Trim audio to millisecond precision — up to 2000× zoom
          </h2>
          <p style={{ textAlign: "center", color: "var(--text-muted)", marginBottom: 32, fontSize: 15 }}>
            Find the exact frame where a sound starts or ends. Rare in any free online audio trimmer.
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
            How MP3 Studio compares to other free online trimmers
          </h2>
          <p style={{ textAlign: "center", color: "var(--text-muted)", marginBottom: 40, fontSize: 15 }}>
            vs. typical audio cutters and mp3 trimmers
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
            How to remove sections from audio online — 3 steps
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
            Frequently asked questions about online audio trimming
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
              Ready to cut multiple parts from your audio?
            </h2>
            <p style={{ color: "var(--text-muted)", marginBottom: 28, lineHeight: 1.6 }}>
              Free online MP3 trimmer — no upload, no software, no sign-up. Your files stay on your device.
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
          MP3 Studio — Free online MP3 trimmer with multiple cuts. No upload. No software. No sign-up. No size limit.
          <br />
          <span style={{ marginTop: 6, display: "inline-block" }}>
            © {new Date().getFullYear()} RIN Production. All rights reserved. &nbsp;·&nbsp;{" "}
            <Link href="/blog" style={{ color: "var(--text-dim)", textDecoration: "underline" }}>Blog</Link>
          </span>
        </footer>
      </div>
    </>
  );
}
