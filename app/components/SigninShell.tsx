import type { HTMLAttributes, ReactNode } from "react";
import Navbar from "./Navbar";

/**
 * The shell every door screen shares: the login at /login, /signup,
 * /password/forgotten, /settings/password (setting a new one) and the 404 —
 * a short column in the middle of the page, one heading, no card around it.
 * Used to be app/styles/signin.css's `.page-signin`/`.signin-card`/`.page-title`;
 * kept as one component for the same reason FormField.tsx exists, so the five
 * screens cannot drift apart by hand.
 *
 * Navbar (wordmark only, no center/right) is the way back to `/` — sticky,
 * same as app/page.tsx's.
 */
export default function SigninShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      // The layout reserves room at the top for a nav bar this route does not
      // have, and a form centred in what is left sits visibly high.
      className="-mt-[var(--main-pad-top)]"
    >
      <Navbar />
      <div className="flex flex-col items-center justify-center gap-5 min-h-screen p-[var(--page-pad-x)]">
        <div className="w-full max-w-[380px] flex flex-col gap-6">
          <h1 className="m-0 text-display-xs text-primary text-center">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

/** The break between the two ways in, with the word that names it. */
export function SigninOr({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={[
        "flex items-center gap-3 mx-[calc(-1*var(--card-pad))]",
        "font-body text-xs text-tertiary",
        "before:content-[''] before:flex-1 before:border-t before:border-secondary",
        "after:content-[''] after:flex-1 after:border-t after:border-secondary",
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
      className={["mt-4 text-center text-[0.875rem] text-tertiary", className]
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
  "text-inherit underline [text-underline-offset:0.2em] hover:text-primary";

/** Why you are on this screen when it was not your idea: an expired recovery
 *  link, mostly. Not styled as an error — see FormError, which is plain
 *  primary text — a notice is set apart by a surface and a rule instead. */
export function SigninNotice({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={[
        "m-0 py-3 px-3.5 border border-secondary rounded-orb-sm",
        "bg-[var(--color-surface-subtle)] text-secondary",
        "text-sm leading-relaxed",
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
export const signinWideButtonClassName = "self-stretch justify-center rounded-orb-sm";
