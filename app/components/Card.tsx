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
  const base = variant === "bento" ? "bento-card" : "about-card";
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
