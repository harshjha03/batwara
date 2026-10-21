import Link from "next/link";

export default function NotFound() {
  return (
    <main className="relative mx-auto w-full flex flex-col justify-center px-[30px]" style={{ maxWidth: "var(--app)", minHeight: "100dvh", zIndex: 1 }}>
      <div className="card !rounded-[22px] !p-6 text-center">
        <div className="brand serif font-bold mb-3" style={{ fontSize: 24 }}>Batwara</div>
        <h1 className="serif font-bold text-[22px] text-white mb-2">Not found</h1>
        <p className="muted text-sm leading-relaxed mb-5">That group or invite doesn&apos;t exist, or you&apos;re not a member of it.</p>
        <Link href="/" className="btn w-full">Go to my groups</Link>
      </div>
    </main>
  );
}
