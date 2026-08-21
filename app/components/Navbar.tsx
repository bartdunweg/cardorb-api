import type { ReactNode } from "react";
import Wordmark from "./Wordmark";

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
      className="sticky top-0 z-[var(--z-sticky)] w-full py-4 px-[var(--page-pad-x)]
        bg-primary [backdrop-filter:blur(16px)] border-b border-secondary"
      aria-label="Primary navigation"
    >
      <div
        className="grid grid-cols-[1fr_auto_minmax(0,1fr)] items-center gap-6 w-[min(100%,1180px)] mx-auto
          min-h-10 [@media(max-width:640px)]:grid-cols-[1fr_minmax(0,auto)]"
      >
        {/* justify-self-start so the link is the size of the mark and the name.
            As a grid item it stretched across the whole 1fr column, which was
            invisible while it was a word and is a lot of dead clickable space
            once there is an image to aim at. */}
        <Wordmark href="/" className="justify-self-start" />
        {center ? (
          <div className="flex items-center gap-9 justify-self-center [@media(max-width:640px)]:hidden">
            {center}
          </div>
        ) : (
          <span />
        )}
        {/* min-w-0 here and minmax(0,1fr) on the column above, because the
            right slot can hold a name: a display name is allowed 60 characters
            and a plain 1fr column refuses to go below its content, so a long
            one pushed the pill off the side of a phone instead of letting it
            clip. Nothing else in this bar is long enough to have noticed. */}
        {right ? (
          <div className="flex items-center gap-4 justify-self-end min-w-0">{right}</div>
        ) : (
          <span />
        )}
      </div>
    </nav>
  );
}
