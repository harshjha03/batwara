"use client";

import Link from "next/link";

// Route-level error boundary: a server failure shows a branded card with a retry, not Next's bare page.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="relative mx-auto w-full flex flex-col justify-center px-[30px]" style={{ maxWidth: "var(--app)", minHeight: "100dvh", zIndex: 1 }}>
      <div className="card !rounded-[22px] !p-6 text-center">
        <div className="brand serif font-bold mb-3" style={{ fontSize: 24 }}>Batwara</div>
        <h1 className="serif font-bold text-[22px] text-white mb-2">Something went wrong</h1>
        <p className="muted text-sm leading-relaxed mb-5">We couldn&apos;t load that. Your data is safe — try again, or go back to your groups.</p>
        <button className="btn w-full" onClick={reset}>Try again</button>
        <Link href="/" className="block mt-3 h-11 leading-[44px] muted text-[13px] font-semibold">Go to my groups</Link>
        {error.digest && <p className="faint text-[11px] mt-4">Ref {error.digest}</p>}
      </div>
    </main>
  );
}
