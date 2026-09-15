import type { Metadata } from "next";
import "./globals.css";
import PostHogProvider from "@/components/PostHogProvider";

export const metadata: Metadata = {
  title: "Online MP3 Trimmer — Multiple Cuts, No Upload, Free",
  description:
    "Remove multiple sections from any MP3, WAV, or FLAC file online — free, no upload, no software. Mark every part to delete, preview the result, and export one clean file. No sign-up.",
  keywords: [
    "mp3 trimmer with multiple cuts online free",
    "online mp3 trimmer multiple cuts",
    "multiple cut mp3 trimmer online",
    "multiple cut audio trimmer free",
    "multiple cut audio trimmer no upload",
    "cut multiple parts from mp3 online free",
    "remove multiple sections from audio online",
    "remove parts from audio online free",
    "delete section from mp3 online free",
    "cut out middle of mp3 online free",
    "audio trimmer no upload free",
    "mp3 cutter no upload",
    "trim audio without uploading",
    "mp3 trimmer no download",
    "audio cutter no software",
    "trim audio online no install",
    "mp3 cutter online free",
    "mp3 trimmer online free",
    "trim mp3 online free",
    "remove ads from podcast mp3",
    "cut silence from audio online free",
    "audio editor runs in browser",
    "free audio editor no download",
    "waveform editor online free",
  ],
  openGraph: {
    title: "Online MP3 Trimmer — Multiple Cuts, No Upload, Free",
    description:
      "Remove multiple sections from your MP3, WAV, or FLAC file online — free, no upload, no software. Mark every part to delete and export one clean file.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Online MP3 Trimmer — Multiple Cuts, No Upload, Free",
    description: "Remove multiple sections from your audio online — free, no upload, no software, no sign-up.",
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
    google: ["08jcNsbiyfgd_rA5f2pJ-sTrjVWzsVCFOmcgoZd7J2c", "h0KcgdR8xdnOkm61M8RBguaUjeBUWC0kQ-b3QTbhcbc"],
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
