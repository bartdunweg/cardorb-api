import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

/**
 * Shared card shell: the one place that knows the base card classes and the
 * accent-wash CSS-variable contract, instead of every card repeating
 * `className="about-card …"` and the `--recent-accent` style object by hand.
 *
 * `variant` picks the base class ("about" for About-page cards, "bento" for
 * home-grid cards); extra classes come in via `className` as usual. `accent`
 * is an "r,g,b" string that feeds the tinted gradient wash some cards render.
 * Server-component friendly (no client hooks).
 */
/** Exported for CardsDashboard.tsx's Kpi, which composes "about-card" onto a
 *  <li> directly rather than through this component. */
export const aboutCardClassName =
  "p-[var(--card-pad)] overflow-hidden border border-[var(--glass-border)] rounded-lg " +
  "bg-[var(--glass-bg)] [backdrop-filter:blur(var(--blur-glass-card))] [box-shadow:var(--shadow-card)]";

type CardProps = {
  variant?: "about" | "bento";
  accent?: string;
  accentAlpha?: number;
  className?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

export default function Card({
  variant = "about",
  accent,
  accentAlpha = 0.15,
  className,
  style,
  children,
  ...rest
}: CardProps) {
  // Used to be card-shell.css's padding/clip plus components.css's border/
  // glass/shadow, both under the shared ".about-card" name. "bento-card" is
  // unstyled on purpose here too — it never had a CSS rule of its own in
  // this app (ported from a portfolio page binder doesn't have), so there is
  // nothing to migrate for it.
  const base = variant === "bento" ? "bento-card" : aboutCardClassName;
  const accentStyle = accent
    ? ({
        "--recent-accent": accent,
        "--recent-accent-alpha": String(accentAlpha),
      } as CSSProperties)
    : undefined;
  return (
    <div
      className={[base, className].filter(Boolean).join(" ")}
      style={accentStyle || style ? { ...accentStyle, ...style } : undefined}
      {...rest}
    >
      {children}
    </div>
  );
}
