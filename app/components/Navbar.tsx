import type { ReactNode } from "react";
import Link from "next/link";
import { APP_NAME } from "../../lib/core/config";

/**
 * The one navbar every top-level page opens with — the landing page with its
 * full center links and right-hand actions, the door screens (login, signup)
 * with just the wordmark. One component so a change to one applies to both,
 * rather than the landing page and SigninShell each keeping their own copy
 * to drift apart by hand.
 *
 * Sticky and full-bleed: the outer `<nav>` spans the viewport and carries its
 * own top/side padding and background (so scrolled content does not show
 * through), while the inner div re-applies the same `1180px` cap app/page.tsx
 * gives the rest of its content, so the wordmark lines up with the page below
 * it rather than drifting to the true viewport centre once the bar goes edge
 * to edge.
 *
 * `center` and `right` are optional: omitted, this is the wordmark alone,
 * which is what the door screens want.
 */
export default function Navbar({ center, right }: { center?: ReactNode; right?: ReactNode }) {
  return (
    <nav
      className="sticky top-0 z-[var(--z-sticky)] w-full [padding:var(--space-4)_var(--page-pad-x)]
        bg-[var(--glass-bg-solid)] [backdrop-filter:blur(16px)] border-b border-[var(--color-border-subtle)]"
      aria-label="Primary navigation"
    >
      <div
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 w-[min(100%,1180px)] mx-auto
          min-h-[var(--control-h)] [@media(max-width:640px)]:grid-cols-[1fr_auto]"
      >
        <Link
          href="/"
          className="text-label [font-family:var(--font-main)] [font-size:var(--fs-label)] [font-weight:var(--fw-button)] tracking-[-0.03em] no-underline"
          aria-label={`${APP_NAME} home`}
        >
          {APP_NAME}
        </Link>
        {center ? (
          <div className="flex items-center gap-9 justify-self-center [@media(max-width:640px)]:hidden">
            {center}
          </div>
        ) : (
          <span />
        )}
        {right ? <div className="flex items-center gap-4 justify-self-end">{right}</div> : <span />}
      </div>
    </nav>
  );
}
