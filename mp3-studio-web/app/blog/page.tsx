import type { Metadata } from "next";
import Link from "next/link";
import { posts } from "@/lib/posts";

export const metadata: Metadata = {
  title: "Blog – MP3 Studio",
  description:
    "Guides and tips for editing audio online — trimming MP3s, removing podcast ads, precision waveform editing, and more.",
};

export default function BlogPage() {
  const sorted = [...posts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#06060f",
        color: "#f1f5f9",
        fontFamily: "Inter, system-ui, sans-serif",
        padding: "60px clamp(16px, 6vw, 120px) 100px",
        maxWidth: 820,
        margin: "0 auto",
      }}
    >
      <Link
        href="/"
        style={{
          color: "#9d67f5",
          textDecoration: "none",
          fontSize: 14,
          display: "inline-block",
          marginBottom: 40,
        }}
      >
        ← Back to MP3 Studio
      </Link>

      <h1
        style={{
          fontSize: "clamp(28px, 5vw, 42px)",
          fontWeight: 800,
          marginBottom: 8,
          background: "linear-gradient(135deg, #f1f5f9 0%, #9d67f5 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Blog
      </h1>
      <p style={{ color: "#94a3b8", marginBottom: 48, fontSize: 16 }}>
        Guides for editing audio online — free, private, no installs.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {sorted.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            style={{ textDecoration: "none" }}
          >
            <article
              style={{
                background: "#111128",
                border: "1px solid #1e1e40",
                borderRadius: 12,
                padding: "24px 28px",
              }}
            >
              <time
                style={{ color: "#475569", fontSize: 13, display: "block", marginBottom: 8 }}
              >
                {new Date(post.date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: "#f1f5f9",
                  marginBottom: 8,
                  lineHeight: 1.3,
                }}
              >
                {post.title}
              </h2>
              <p style={{ color: "#94a3b8", fontSize: 15, lineHeight: 1.6, margin: 0 }}>
                {post.description}
              </p>
            </article>
          </Link>
        ))}
      </div>
    </main>
  );
}
