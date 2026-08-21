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
/**
 * Untitled UI's card surface, taken whole.
 *
 * This was the glass recipe — a translucent fill, a 24px radius, a backdrop
 * blur and a hand-tuned shadow — and it was the material every card in the app
 * was made of. ADR-0061 removed glass from the protected list, so it is theirs
 * now: `rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset`, which
 * is what `MetricsSimple` and every other Untitled UI card draws.
 *
 * One constant rather than four edits, on purpose. Every card in the app reads
 * this, so the dashboard tiles, the value chart, the movers and the priciest
 * table cannot end up on three different surfaces — which is the same property
 * `--btn-primary-bg` has for the accent, and the same one line to reverse.
 *
 * The padding stays a variable: it is layout, not material, and cards.css still
 * reads it.
 */
export const aboutCardClassName =
  "p-[var(--card-pad)] overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset";

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
