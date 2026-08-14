import Link from "next/link";
import type { LucideProps } from "lucide-react";

// Shared glass-pill button. Renders as a Link, external <a>, <button>, or a
// plain <span> (when it sits inside a parent link, e.g. a clickable card).
const ICON = { size: 16, strokeWidth: 1.75 } as const;

// .btn and its modifiers (--primary/--icon/--center/--back) stay CSS, in
// what's left of app/styles/components.css, rather than moving into this
// component: ~20 files render a raw `<button className="btn">` outside this
// component entirely, most of them in the not-yet-migrated cards.css family
// (CardNav, CardsSidebar, FilterSheet, ViewSheet, CardAddDialog, ...).
// Porting .btn to Tailwind properly means touching all of them together —
// scope for a future chunk, not this one.

type ButtonProps = {
  children: React.ReactNode;
  /* ComponentType rather than LucideIcon, so ExternalArrow can be handed in
     where ArrowUpRight used to be. It takes the same props and renders two of
     them; a Lucide icon still satisfies this, being one of these already. */
  icon?: React.ComponentType<LucideProps>;
  iconPosition?: "left" | "right";
  iconFill?: boolean;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  className?: string;
  "aria-label"?: string;
  /** For a button that is deliberately not actionable yet but must stay
      focusable, so it can explain itself. `disabled` would hide it from the
      keyboard and swallow the events that reveal the explanation. */
  "aria-disabled"?: boolean;
};

export default function Button({
  children,
  icon: Icon,
  iconPosition = "right",
  iconFill = false,
  href,
  external,
  onClick,
  className = "",
  ...rest
}: ButtonProps) {
  const cls = ["btn", className].filter(Boolean).join(" ");
  const iconEl = Icon ? <Icon {...ICON} fill={iconFill ? "currentColor" : "none"} /> : null;

  const content = (
    <>
      {iconPosition === "left" && iconEl}
      <span>{children}</span>
      {iconPosition === "right" && iconEl}
    </>
  );

  // Every external link on the site says so the same way: an sr-only suffix
  // rather than an icon alone, which is 3.2.5 and only reaches people who can
  // see it. Some links announced it and some did not, which is worse than
  // either, because the silence then reads as "this one stays here".
  if (href) {
    return external ? (
      <a className={cls} href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {content}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    ) : (
      <Link className={cls} href={href} {...rest}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} {...rest}>
        {content}
      </button>
    );
  }

  // Visual only: the parent element is the link/click target.
  return (
    <span className={cls} {...rest}>
      {content}
    </span>
  );
}
