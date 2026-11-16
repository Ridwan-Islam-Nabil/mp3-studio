import Link from "next/link";
import { tools, type Tool } from "@/lib/tools";

/** Cards linking to tool pages (server component). Defaults to every tool. */
export default function ToolsGrid({ items = tools }: { items?: Tool[] }) {
  return (
    <ul className="tools-grid">
      {items.map((t) => (
        <li key={t.slug}>
          <Link href={`/${t.slug}`} className="glass tool-card">
            <span className="tool-card-title">{t.navLabel} →</span>
            <span className="tool-card-summary">{t.summary}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
