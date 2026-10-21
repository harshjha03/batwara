import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "./sw-register";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Batwara",
  description: "Split expenses with friends",
  appleWebApp: { capable: true, title: "Batwara", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#04382b", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Material Symbols icon font. A plain stylesheet link (not @import) so CSS optimization
            can't strip it; next/font doesn't cover variable icon fonts. display=block avoids tofu. */}
        {/* block (not swap/optional) is right for an icon font: swap would flash the ligature text. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,300..700,0..1,0&display=block"
        />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Every page is per-user, so it renders at request time and streams in. */}
        <Suspense fallback={<main className="mx-auto max-w-6xl px-4 py-4 muted">Loading…</main>}>{children}</Suspense>
        <ServiceWorker />
      </body>
    </html>
  );
}
