import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { posts, getPostBySlug } from "@/lib/posts";

export async function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  return {
    title: `${post.title} – MP3 Studio`,
    description: post.description,
    keywords: post.keywords,
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.date,
    },
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { "@type": "Organization", name: "RIN Production" },
    publisher: { "@type": "Organization", name: "MP3 Studio" },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
          href="/blog"
          style={{
            color: "#9d67f5",
            textDecoration: "none",
            fontSize: 14,
            display: "inline-block",
            marginBottom: 40,
          }}
        >
          ← All posts
        </Link>

        <time style={{ color: "#475569", fontSize: 13, display: "block", marginBottom: 12 }}>
          {new Date(post.date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </time>

        <h1
          style={{
            fontSize: "clamp(24px, 4vw, 38px)",
            fontWeight: 800,
            lineHeight: 1.2,
            marginBottom: 16,
          }}
        >
          {post.title}
        </h1>

        <p
          style={{
            color: "#94a3b8",
            fontSize: 17,
            lineHeight: 1.7,
            marginBottom: 40,
            borderBottom: "1px solid #1e1e40",
            paddingBottom: 32,
          }}
        >
          {post.description}
        </p>

        <div
          style={{
            fontSize: 16,
            lineHeight: 1.8,
            color: "#cbd5e1",
          }}
          className="prose"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        <div
          style={{
            marginTop: 64,
            padding: "28px 32px",
            background: "#111128",
            border: "1px solid #1e1e40",
            borderRadius: 12,
            textAlign: "center",
          }}
        >
          <p style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
            Try MP3 Studio — Free, No Upload
          </p>
          <p style={{ color: "#94a3b8", marginBottom: 20, fontSize: 15 }}>
            Cut multiple sections, zoom to 2000×, export privately in your browser.
          </p>
          <Link
            href="/"
            style={{
              display: "inline-block",
              background: "#7c3aed",
              color: "white",
              padding: "12px 28px",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            Open MP3 Studio →
          </Link>
        </div>
      </main>

      <style>{`
        .prose h2 { color: #f1f5f9; font-size: 22px; font-weight: 700; margin: 36px 0 12px; }
        .prose p { margin: 0 0 16px; }
        .prose a { color: #9d67f5; }
        .prose a:hover { color: #c4b5fd; }
        .prose ol, .prose ul { padding-left: 24px; margin: 0 0 16px; }
        .prose li { margin-bottom: 8px; }
        .prose strong { color: #f1f5f9; }
      `}</style>
    </>
  );
}
