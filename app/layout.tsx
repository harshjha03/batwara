import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Libre_Caslon_Text, Libre_Caslon_Display } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "./sw-register";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
// Serif display type — card titles, names, brand (Text) and big numerals (Display).
const caslon = Libre_Caslon_Text({ variable: "--font-serif", subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"] });
const caslonDisplay = Libre_Caslon_Display({ variable: "--font-display", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "Batwara",
  description: "Shared expenses, settled to the paisa.",
  robots: { index: false, follow: false }, // private app: every page is per-user
  appleWebApp: { capable: true, title: "Batwara", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#04382b", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${caslon.variable} ${caslonDisplay.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* Every page is per-user, so it renders at request time and streams in. */}
        <Suspense fallback={<main className="mx-auto max-w-6xl px-4 py-4 muted">Loading…</main>}>{children}</Suspense>
        <ServiceWorker />
      </body>
    </html>
  );
}
