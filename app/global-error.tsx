"use client";

// Last-resort boundary (root layout itself failed), so it must render its own <html>/<body>.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#021f17", color: "#ecfdf5", fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Batwara hit a snag</h1>
          <p style={{ color: "rgba(234,255,245,.6)", fontSize: 14, lineHeight: 1.5, margin: "0 0 20px" }}>Reload to continue. Nothing you saved has been lost.</p>
          <button onClick={reset} style={{ height: 48, padding: "0 22px", borderRadius: 13, border: "none", background: "linear-gradient(135deg,#10b981,#0d9488 60%,#0f766e)", color: "#fff", fontWeight: 600, fontSize: 15 }}>Reload</button>
        </div>
      </body>
    </html>
  );
}
