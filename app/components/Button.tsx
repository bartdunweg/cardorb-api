import type { LucideProps } from "lucide-react";
import { Button as UntitledButton } from "@/components/base/buttons/button";

/**
 * Card Orb's button, which is Untitled UI's button with this app's vocabulary.
 *
 * It used to be the glass pill: `buttonClassName` from controlClasses.ts, plus
 * `.btn--primary`/`.btn--icon`/`.btn--center`/`.btn--back` still in
 * components.css. ADR-0055 replaced the material; this kept the shape of the
 * API so the call sites did not all have to move at once.
 *
 * ── Why this is still here rather than deleted ─────────────────────────────
 *
 * Untitled UI's Button is a React Aria Button or Link, and React Aria's Link is
 * not Next's. A `<Button href>` here has to route client-side, keep the prefetch
 * and not do a full page load, so something has to sit in between. That is this
 * file's whole remaining job, plus two conventions below that are this app's
 * rather than the library's.
 *
 * Two things it deliberately keeps from the old component:
 *
 *   1. **The external-link announcement.** Every external link on this site says
 *      so the same way, with an sr-only suffix rather than an icon alone —
 *      an icon alone is 3.2.5 and only reaches people who can see it. Some links
 *      announced it and some did not, which is worse than either, because the
 *      silence then reads as "this one stays here".
 *
 *   2. **The plain-span mode.** With neither `href` nor `onClick`, this renders
 *      a `<span>`: a button that looks like one but is not, for when the whole
 *      card around it is the link. A real nested button inside a link is invalid
 *      and behaves differently in every browser.
 */
const ICON = { size: 16, strokeWidth: 1.75 } as const;

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
  /** Untitled UI's colour vocabulary, passed straight through. */
  color?: "primary" | "secondary" | "tertiary";
  size?: "sm" | "md" | "lg" | "xl";
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
  color = "secondary",
  size = "md",
  ...rest
}: ButtonProps) {
  const iconEl = Icon ? (
    <Icon {...ICON} fill={iconFill ? "currentColor" : "none"} data-icon={iconPosition} />
  ) : null;

  const shared = {
    color,
    size,
    className,
    ...(iconPosition === "left" ? { iconLeading: iconEl } : { iconTrailing: iconEl }),
  } as const;

  if (href) {
    return external ? (
      <UntitledButton {...shared} href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
        <span className="sr-only"> (opens in a new tab)</span>
      </UntitledButton>
    ) : (
      // React Aria's Link renders a plain <a>. Next's client router picks up a
      // same-origin <a> through its own navigation handling, so the route change
      // stays client-side without a Next <Link> wrapper that React Aria's Button
      // has no slot for.
      <UntitledButton {...shared} href={href} {...rest}>
        {children}
      </UntitledButton>
    );
  }

  if (onClick) {
    return (
      <UntitledButton {...shared} onPress={onClick} {...rest}>
        {children}
      </UntitledButton>
    );
  }

  // Visual only: the parent element is the link/click target. Not a React Aria
  // Button — that would render a real <button>, and a <button> inside an <a> is
  // invalid and behaves differently in every browser.
  return (
    <span
      className={[
        "inline-flex items-center justify-center gap-1 rounded-lg px-3.5 py-2.5",
        "text-sm font-semibold bg-primary text-secondary ring-1 ring-primary ring-inset",
        "shadow-xs-skeuomorphic",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {iconPosition === "left" && iconEl}
      <span className="px-0.5">{children}</span>
      {iconPosition === "right" && iconEl}
    </span>
  );
}
