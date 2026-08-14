import type { HTMLAttributes, ReactNode } from "react";
import Card from "./Card";

/**
 * The shell every door screen shares: the login at /login, /signup,
 * /password/forgotten, /settings/password (setting a new one) and the 404 —
 * a short column in the middle of the page, one card, one heading. Used to be
 * app/styles/signin.css's `.page-signin`/`.signin-card`/`.page-title`; kept as
 * one component for the same reason FormField.tsx exists, so the five screens
 * cannot drift apart by hand.
 */
export default function SigninShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      // The layout reserves room at the top for a nav bar this route does not
      // have, and a form centred in what is left sits visibly high.
      className="min-h-screen flex flex-col items-center justify-center gap-5 -mt-[var(--main-pad-top)] p-[var(--page-pad-x)]"
    >
      <Card
        // Clips, and nothing here escapes its edges; kept explicit because the
        // form's focus ring sits right against the padding.
        className="w-full max-w-[380px] flex flex-col gap-6 overflow-visible"
      >
        <h1 className="m-0 [font-size:var(--fs-card)] text-label text-center">{title}</h1>
        {children}
      </Card>
    </section>
  );
}

/** The break between the two ways in, with the word that names it. */
export function SigninOr({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={[
        "flex items-center gap-3 mx-[calc(-1*var(--card-pad))]",
        "[font-family:var(--font-body)] [font-size:var(--fs-small)] text-label-tertiary",
        "before:content-[''] before:flex-1 before:border-t before:border-[var(--color-border)]",
        "after:content-[''] after:flex-1 after:border-t after:border-[var(--color-border)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}

/** The way out of a login that is not working for you. */
export function SigninLinks({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={["mt-4 text-center text-[0.875rem] text-label-tertiary", className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}

/** Pass to next/link's Link (or an <a>) inside SigninLinks: underlines,
 *  inherits colour, brightens on hover. Not a component, because these are
 *  always a next/link Link — a wrapper would either drop client routing or
 *  have to re-forward every Link prop for no benefit. */
export const signinLinkClassName =
  "text-inherit underline [text-underline-offset:0.2em] hover:text-label";

/** Why you are on this screen when it was not your idea: an expired recovery
 *  link, mostly. Not styled as an error — see FormError, which is plain
 *  primary text — a notice is set apart by a surface and a rule instead. */
export function SigninNotice({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={[
        "m-0 py-3 px-[var(--space-3-5)] border border-[var(--color-border-subtle)] rounded-sm",
        "bg-[var(--color-surface-subtle)] text-label-secondary",
        "[font-size:var(--fs-body-s)] leading-relaxed",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}

/** .signin-public / .signin-submit: full width and square, unlike the pill
 *  .btn draws for toolbars — the two full-width ways in read as a pair. */
export const signinWideButtonClassName = "self-stretch justify-center rounded-sm";
