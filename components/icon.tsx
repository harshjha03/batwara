import type { ReactNode } from "react";

// Inline SVG icons (Lucide-style strokes), matching the Batwara design. No icon font, no emoji.
// Stroke icons are listed as path `d` strings; icons that need circles/rects/fills use `raw`.
type Spec = { paths?: string[]; raw?: ReactNode; fill?: boolean };

const C = (cx: number, cy: number, r: number) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />;

const ICONS: Record<string, Spec> = {
  // actions
  check: { paths: ["M20 6L9 17l-5-5"] },
  add: { paths: ["M12 5v14", "M5 12h14"] },
  close: { paths: ["M18 6L6 18M6 6l12 12"] },
  edit: { paths: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"] },
  delete: { paths: ["M3 6h18", "M8 6V4h8v2", "M6 6l1 14h10l1-14"] },
  undo: { paths: ["M3 7v6h6", "M21 17a9 9 0 0 0-15-6.7L3 13"] },
  link: { paths: ["M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1", "M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"] },
  copy: { raw: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></> },
  share: { raw: <>{C(18, 5, 3)}{C(6, 12, 3)}{C(18, 19, 3)}<path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4" /></> },
  download: { paths: ["M12 3v12", "M7 10l5 5 5-5", "M5 21h14"] },
  // chevrons / arrows
  arrow: { paths: ["M5 12h14", "M13 6l6 6-6 6"] },
  "chevron-right": { paths: ["M9 6l6 6-6 6"] },
  "chevron-down": { paths: ["M6 9l6 6 6-6"] },
  back: { paths: ["M15 6l-6 6 6 6"] },
  // nav
  scale: { paths: ["M12 3v18M4 7l8-3 8 3", "M4 7l-2 6a3 3 0 0 0 6 0L6 7M18 7l-2 6a3 3 0 0 0 6 0l-2-6"] },
  receipt: { paths: ["M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6"] },
  chart: { paths: ["M3 3v18h18", "M7 14l3-4 3 3 4-6"] },
  people: { raw: <>{C(9, 8, 3)}<path d="M3 20a6 6 0 0 1 12 0M16 6a3 3 0 0 1 0 6M21 20a6 6 0 0 0-5-5.9" /></> },
  "person-add": { raw: <>{C(10, 8, 3.2)}<path d="M4 20a6 6 0 0 1 11 0M16 11l2 2 4-4" /></> },
  // menu / misc
  more: { fill: true, raw: <>{C(5, 12, 2)}{C(12, 12, 2)}{C(19, 12, 2)}</> },
  history: { paths: ["M3 3v5h5", "M3.05 13A9 9 0 1 0 6 5.3L3 8", "M12 8v4l3 2"] },
  settings: { raw: <>{C(12, 12, 3)}<path d="M19.4 14a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V20a2 2 0 1 1-4 0a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4 14a2 2 0 1 1 0-4a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11 4a2 2 0 1 1 4 0a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 20 10a2 2 0 1 1 0 4z" /></> },
  logout: { paths: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"] },
  card: { raw: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></> },
  cash: { raw: <><rect x="2" y="6" width="20" height="12" rx="2" />{C(12, 12, 2.5)}</> },
  wallet: { paths: ["M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12", "M17 13h.01"] },
  // multicolor brand mark
  google: {
    fill: true,
    raw: (
      <>
        <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6z" />
        <path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.6-2-6.5-4.8H1.7v3C3.6 21.3 7.5 24 12 24z" />
        <path fill="#FBBC05" d="M5.5 14.6a7.2 7.2 0 0 1 0-4.6v-3H1.7a12 12 0 0 0 0 10.6l3.8-3z" />
        <path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.6 11.6 0 0 0 12 0C7.5 0 3.6 2.7 1.7 6.7l3.8 3C6.4 6.8 9 4.8 12 4.8z" />
      </>
    ),
  },
};

// Aliases so older call sites keep working.
const ALIAS: Record<string, string> = {
  account_balance_wallet: "scale", receipt_long: "receipt", group: "people", group_add: "person-add",
  more_horiz: "more", arrow_forward: "arrow", credit_card: "card", payments: "cash", chevron_right: "chevron-right",
};

export function Icon({ name, size = 20, className = "", strokeWidth = 2 }: { name: string; size?: number; className?: string; strokeWidth?: number }) {
  const spec = ICONS[name] ?? ICONS[ALIAS[name]] ?? ICONS.chart;
  const strokeProps = spec.fill ? {} : { fill: "none", stroke: "currentColor", strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`inline-block align-[-0.125em] shrink-0 ${className}`} aria-hidden="true" {...strokeProps}>
      {spec.raw ?? spec.paths?.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

/** Deterministic ring/tint for an avatar when there's no balance signal (mint default). */
export function Avatar({ name, size = 38, ring = "var(--gbd)", tint = "var(--mint)", className = "" }: { name: string; size?: number; ring?: string; tint?: string; className?: string }) {
  const initials = name.replace(/\(you\)/i, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full shrink-0 font-[family-name:var(--font-serif)] font-semibold ${className}`}
      style={{ width: size, height: size, background: "rgba(255,255,255,.06)", border: `1.5px solid ${ring}`, color: tint, fontSize: size * 0.37 }}
    >
      {initials}
    </span>
  );
}
