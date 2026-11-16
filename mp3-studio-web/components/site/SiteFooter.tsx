import Link from "next/link";
import { tools } from "@/lib/tools";

/** Site-wide footer (server component): tool pages, blog, home. Internal links for crawlers. */
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav aria-label="Free tools" className="site-footer-tools">
        <span className="site-footer-heading">Free tools</span>
        <ul>
          <li><Link href="/">Multi-cut MP3 trimmer</Link></li>
          {tools.map((t) => (
            <li key={t.slug}><Link href={`/${t.slug}`}>{t.navLabel}</Link></li>
          ))}
          <li><Link href="/blog">Blog</Link></li>
        </ul>
      </nav>
      <p>
        MP3 Studio — free online audio editor. No upload. No software. No sign-up.
        <br />
        © {new Date().getFullYear()} RIN Production. All rights reserved.
      </p>
    </footer>
  );
}
