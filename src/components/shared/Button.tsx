import type { SVGProps } from "react";
import { Button as UntitledButton } from "@/components/base/buttons/button";

/**
 * Card Orb's button, which is Untitled UI's button with this app's vocabulary.
 *
 * It used to be the glass pill: `buttonClassName` from controlClasses.ts, plus
 * `.btn--primary`/`.btn--icon`/`.btn--center`/`.btn--back` still in
 * components.css. ADR-0056 replaced the material; this kept the shape of the
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
 *   2. **The plain-span mode.** With none of `href`, `onClick` or `type`, this
 *      renders a `<span>`: a button that looks like one but is not, for when the
 *      whole card around it is the link. A real nested button inside a link is
 *      invalid and behaves differently in every browser.
 *
 *      `type` counts because a form's submit button has no `onClick` — the
 *      form's `onSubmit` fires instead — and would otherwise fall through to
 *      the span and silently stop submitting anything.
 */
const ICON = { size: 16, strokeWidth: 1.75 } as const;

/* The shape an @untitledui/icons component takes: every SVG prop, plus `size`,
   which they turn into width and height. Spelled out here rather than imported
   because the package exports the icons themselves and not this type. */
export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

type ButtonProps = {
  children: React.ReactNode;
  /* ComponentType rather than the icon type itself, so ExternalArrow can be
     handed in where ArrowUpRight used to be. It takes the same props and
     renders two of them; an Untitled UI icon satisfies this already. */
  icon?: React.ComponentType<IconProps>;
  iconPosition?: "left" | "right";
  // No `iconFill`. It set fill="currentColor" on a line icon to fake a solid
  // one, had no caller anywhere, and is the wrong technique now regardless:
  // @untitledui-pro/icons/solid draws the filled cut properly. A button that
  // wants one imports it — see CardsTabBar and CardsSidebar.
  href?: string;
  external?: boolean;
  onClick?: () => void;
  /** A form's submit button has no onClick — the form's own onSubmit fires.
      Passing this is what tells the plain-span branch below not to take it. */
  type?: "button" | "submit";
  /** Spelled the DOM's way rather than React Aria's `isDisabled`, because every
      call site here is replacing a plain <button disabled>. Mapped over below. */
  disabled?: boolean;
  className?: string;
  /** Untitled UI's colour vocabulary, passed straight through. The destructive
      four are theirs too; `primary-destructive` is what deleting an account
      uses. */
  color?:
    | "primary"
    | "secondary"
    | "tertiary"
    | "link-color"
    | "link-gray"
    | "primary-destructive"
    | "secondary-destructive"
    | "tertiary-destructive"
    | "link-destructive";
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
  href,
  external,
  onClick,
  type,
  disabled,
  className = "",
  color = "secondary",
  size = "md",
  ...rest
}: ButtonProps) {
  const iconEl = Icon ? (
    <Icon {...ICON} data-icon={iconPosition} />
  ) : null;

  const shared = {
    color,
    size,
    className,
    isDisabled: disabled,
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

  if (onClick || type) {
    return (
      <UntitledButton {...shared} type={type} onPress={onClick} {...rest}>
        {children}
      </UntitledButton>
    );
  }

  // Visual only: the parent element is the link/click target. Not a React Aria
  // Button — that would render a real <button>, and a <button> inside an <a> is
  // invalid and behaves differently in every browser.
  //
  // ── Why this is a hand-copy of the `md`/`secondary` recipe ────────────────
  //
  // It should be `untitledButton({ color, size, className })` — that helper
  // exists for exactly this, and ADR-0068 is the record of copies like this one
  // being replaced by it. It cannot be, here: `untitledButtonClasses.ts` is
  // "use client" because it reads `styles` out of a "use client" module, and
  // **this file has no "use client"**. A server component may render a client
  // component, but it may not read a value out of one — at prerender it gets
  // Next's client-reference proxy and `styles.common` is `undefined`. That is
  // the /_not-found crash ADR-0068 describes, and reaching for the helper here
  // is how it comes back.
  //
  // So the copy stays, and the two things it must not get wrong are marked:
  //
  //   - **Shape.** `rounded-control` and `px-(--control-px-md)` are read from
  //     the same variables `button.tsx` reads, so this span follows a
  //     `shape-rectangle` ancestor without this file knowing shape exists.
  //     It said `rounded-lg px-3.5`, which was the right answer for one shape.
  //   - **The inner border.** `before:` was missing from this copy entirely,
  //     so this span has always drawn a flatter edge than the real button
  //     beside it. Restored.
  //
  // Still wrong and deliberately left alone, because it is not this change's
  // subject: the recipe is pinned to `secondary`/`md`, so `color` and `size`
  // are silently ignored on this branch. No call site passes them here today.
  return (
    <span
      className={[
        "relative inline-flex items-center justify-center gap-1 rounded-control px-(--control-px-md) py-2.5",
        "text-sm font-semibold bg-primary text-secondary ring-1 ring-primary ring-inset",
        "shadow-xs-skeuomorphic before:absolute before:rounded-control-inner",
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
