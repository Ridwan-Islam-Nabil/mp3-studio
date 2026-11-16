import type { Metadata } from "next";
import Link from "next/link";
import { getPostBySlug, type Post } from "@/lib/posts";
import { jsonLdString, pageMetadata } from "@/lib/seo";
import { editorHref, getToolBySlug, toolJsonLd, type Tool } from "@/lib/tools";
import SiteFooter from "./SiteFooter";
import SiteNav from "./SiteNav";
import ToolsGrid from "./ToolsGrid";

const sectionH2: React.CSSProperties = {
  fontSize: "clamp(22px, 3.5vw, 30px)",
  fontWeight: 800,
  margin: "0 0 24px",
};

/** The tool for a slug; throws (fails the build) if a route names a slug missing from lib/tools.ts. */
function requireTool(slug: string): Tool {
  const tool = getToolBySlug(slug);
  if (!tool) throw new Error(`No tool "${slug}" in lib/tools.ts`);
  return tool;
}

/** Metadata (title, description, keywords, canonical, OG/Twitter) for a tool page route. */
export function toolMetadata(slug: string): Metadata {
  const tool = requireTool(slug);
  return pageMetadata({ title: tool.title, description: tool.description, path: `/${tool.slug}`, keywords: tool.keywords });
}

/**
 * Layout for every feature landing page (app/(tools)/<slug>/page.tsx). Server component, no
 * client JS of its own: content comes from lib/tools.ts. Exactly one H1.
 */
export default function ToolPage({ slug }: { slug: string }) {
  const tool = requireTool(slug);
  const href = editorHref(tool.editor);
  const related = tool.related.map(getToolBySlug).filter((t): t is Tool => !!t);
  const posts = tool.relatedPosts.map(getPostBySlug).filter((p): p is Post => !!p);

  return (
    <>
      {toolJsonLd(tool).map((ld, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(ld) }} />
      ))}

      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
        <SiteNav editorHref={href} />

        <main className="tool-main">
          <nav aria-label="Breadcrumb" className="tool-breadcrumb">
            <Link href="/">MP3 Studio</Link> <span aria-hidden="true">/</span> <span>{tool.navLabel}</span>
          </nav>

          {/* ── Hero ── */}
          <header style={{ textAlign: "center", padding: "24px 0 56px" }}>
            <div className="tool-badge">Free · No upload · No sign-up</div>
            <h1 style={{ fontSize: "clamp(30px, 5.5vw, 52px)", fontWeight: 900, lineHeight: 1.12, margin: "0 0 24px" }}>
              {tool.h1}
            </h1>
            {tool.intro.map((p, i) => (
              <p key={i} className="tool-intro">{p}</p>
            ))}
            <div style={{ marginTop: 32 }}>
              <Link href={href} className="btn btn-primary" data-testid="tool-cta" style={{ fontSize: 16, padding: "14px 32px" }}>
                {tool.ctaLabel} →
              </Link>
            </div>
            <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 14 }}>
              Runs in your browser. Your file never leaves your device.
            </p>
          </header>

          {/* ── How to ── */}
          <section style={{ padding: "40px 0" }} aria-labelledby="how-to">
            <h2 id="how-to" style={sectionH2}>How it works</h2>
            <ol className="tool-steps">
              {tool.steps.map((s, i) => (
                <li key={s.name} id={`step-${i + 1}`} className="glass tool-step">
                  <span className="tool-step-n" aria-hidden="true">{i + 1}</span>
                  <div>
                    <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700 }}>{s.name}</h3>
                    <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14, lineHeight: 1.6 }}>{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* ── Good to know ── */}
          {tool.notes.length > 0 && (
            <section style={{ padding: "40px 0" }} aria-labelledby="good-to-know">
              <h2 id="good-to-know" style={sectionH2}>Good to know</h2>
              <ul className="glass tool-notes">
                {tool.notes.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </section>
          )}

          {/* ── FAQ ── */}
          <section style={{ padding: "40px 0" }} aria-labelledby="faq">
            <h2 id="faq" style={sectionH2}>Frequently asked questions</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {tool.faqs.map((f) => (
                <div key={f.q} className="glass" style={{ padding: "20px 24px" }}>
                  <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700 }}>{f.q}</h3>
                  <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14, lineHeight: 1.65 }}>{f.a}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── CTA ── */}
          <section style={{ padding: "40px 0", textAlign: "center" }}>
            <div className="glass" style={{ padding: "40px 24px" }}>
              <h2 style={{ ...sectionH2, marginBottom: 12 }}>Ready? It takes about a minute.</h2>
              <p style={{ color: "var(--text-muted)", margin: "0 0 24px", lineHeight: 1.6 }}>
                Free, no account, no watermark. Processing happens on your device.
              </p>
              <Link href={href} className="btn btn-primary" style={{ fontSize: 16, padding: "14px 32px" }}>
                {tool.ctaLabel} →
              </Link>
            </div>
          </section>

          {/* ── Related ── */}
          {related.length > 0 && (
            <section style={{ padding: "40px 0" }} aria-labelledby="related-tools">
              <h2 id="related-tools" style={sectionH2}>Related tools</h2>
              <ToolsGrid items={related} />
            </section>
          )}

          {posts.length > 0 && (
            <section style={{ padding: "40px 0 80px" }} aria-labelledby="related-guides">
              <h2 id="related-guides" style={sectionH2}>Guides</h2>
              <ul className="tool-guides">
                {posts.map((p) => (
                  <li key={p.slug}><Link href={`/blog/${p.slug}`}>{p.title}</Link></li>
                ))}
              </ul>
            </section>
          )}
        </main>

        <SiteFooter />
      </div>
    </>
  );
}
