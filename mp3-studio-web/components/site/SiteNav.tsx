import Link from "next/link";

/** Sticky top bar shared by the home page and the tool pages (server component). */
export default function SiteNav({ editorHref = "/editor" }: { editorHref?: string }) {
  return (
    <nav className="site-nav" aria-label="Main">
      <Link href="/" className="site-nav-logo" aria-label="MP3 Studio home">
        <span className="gradient-text">MP3</span> <span style={{ color: "var(--text)" }}>Studio</span>
      </Link>
      <div className="site-nav-links">
        <Link href="/#tools" className="site-nav-link">Tools</Link>
        <Link href="/blog" className="site-nav-link">Blog</Link>
        <Link href={editorHref} className="btn btn-primary" style={{ fontSize: 13 }}>
          Open Editor →
        </Link>
      </div>
    </nav>
  );
}
