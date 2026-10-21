// Google Material Symbols. Decorative by default (aria-hidden) — give the
// surrounding button an aria-label. Lives outside app/ because app/icon.* is a
// reserved Next favicon filename.
export function Icon({ name, className = "", filled, size }: { name: string; className?: string; filled?: boolean; size?: number }) {
  return (
    <span
      className={`material-symbols-outlined${filled ? " fill" : ""}${className ? " " + className : ""}`}
      style={size ? { fontSize: size } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
