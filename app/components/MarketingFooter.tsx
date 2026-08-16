import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import { APP_NAME } from "../../lib/core/config";
import { navLink } from "./marketingClasses";

/**
 * The footer both public pages end on.
 *
 * It was written inline at the bottom of app/page.tsx, which was fine while
 * the landing page was the only page it could appear on. /app/ios is the
 * second, and a second inline copy is how the two would drift — the same
 * argument Navbar.tsx already makes for itself one component over.
 *
 * Three columns: the wordmark, the Cardmarket note, and the theme toggle. The
 * middle column carries the links now as well, because there is somewhere to
 * link to; below 640px the grid stacks and centres.
 */
export default function MarketingFooter() {
  return (
    <footer
      className="grid grid-cols-[1fr_minmax(0,1.6fr)_1fr] gap-4 items-start pt-5
        border-t border-[var(--color-border-subtle)] text-label-tertiary
        [font-family:var(--font-body)] [font-size:var(--fs-small)]
        [@media(max-width:640px)]:grid-cols-1 [@media(max-width:640px)]:text-center"
    >
      <span className="text-label [font-family:var(--font-main)] [font-size:var(--fs-label)] [font-weight:var(--fw-button)] tracking-[-0.03em] no-underline">
        {APP_NAME}
      </span>
      <div className="grid gap-2 justify-items-center">
        <p className="m-0 text-center">
          Prices come from Cardmarket, in euros — the market collectors recognise.
        </p>
        <Link href="/app/ios" className={navLink}>
          iPhone app
        </Link>
      </div>
      <div className="flex items-center justify-self-end [@media(max-width:640px)]:justify-self-center">
        <ThemeToggle />
      </div>
    </footer>
  );
}
