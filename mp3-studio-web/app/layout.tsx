import type { Metadata } from "next";
import "./globals.css";
import PostHogProvider from "@/components/PostHogProvider";

export const metadata: Metadata = {
  title: "MP3 Studio – Free Online Audio Editor & Trimmer",
  description:
    "Trim, cut, and export MP3 files directly in your browser. No upload to servers. No sign-up. Free forever. Works with MP3, WAV, M4A, FLAC and more.",
  keywords: [
    "mp3 trimmer online",
    "audio cutter",
    "cut mp3 online free",
    "trim audio online",
    "waveform editor",
    "remove silence from audio",
    "audio editor no upload",
  ],
  openGraph: {
    title: "MP3 Studio – Free Online Audio Editor",
    description:
      "Trim and export audio files privately in your browser. No server. No sign-up.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "MP3 Studio – Free Online Audio Editor",
    description: "Trim and export audio files privately in your browser.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  icons: {
    icon: "/thumbnail.png",
    apple: "/icon-192.png",
  },
  verification: {
    google: "08jcNsbiyfgd_rA5f2pJ-sTrjVWzsVCFOmcgoZd7J2c",
    other: { "msvalidate.01": "A21651D1BE9A6F5D712E7558FA5393FD" },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* Inter is loaded via CSS globals.css @import or falls back to system-ui */}
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body><PostHogProvider>{children}</PostHogProvider></body>
    </html>
  );
}
