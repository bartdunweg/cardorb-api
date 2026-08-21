import Link from "next/link";
import ThemeToggle from "@/components/custom/ThemeToggle";
import { navLink } from "@/components/custom/marketingClasses";
import Wordmark from "@/components/custom/Wordmark";

/**
 * The footer both public pages end on.
 *
 * It was written inline at the bottom of app/page.tsx, which was fine while
 * the landing page was the only page it could appear on. /app/ios is the
 * second, and a second inline copy is how the two would drift — the same
 * argument Navbar.tsx already makes for itself one component over.
 *
 * Two parallel branches reached this conclusion the same day and each
 * extracted its own footer: this one for /app/ios, and a `Footer.tsx` for
 * /privacy and /terms. This one won the merge on arriving first and on having
 * somewhere to put links; the other was deleted whole rather than kept beside
 * it, which is the same resolution ADR-0034 records for `displayNameOf()`.
 * /privacy and /terms render it through LegalPage.tsx.
 *
 * Three columns: the wordmark, the Cardmarket note, and the theme toggle. The
 * middle column carries the links now as well, because there is somewhere to
 * link to; below 640px the grid stacks and centres.
 */
export default function MarketingFooter() {
  return (
    <footer
      className="grid grid-cols-[1fr_minmax(0,1.6fr)_1fr] gap-4 items-start pt-5
        border-t border-secondary text-tertiary
        font-body text-xs
        [@media(max-width:640px)]:grid-cols-1 [@media(max-width:640px)]:text-center"
    >
      <Wordmark />
      <div className="grid gap-2 justify-items-center">
        <p className="m-0 text-center">
          Prices come from Cardmarket, in euros — the market collectors recognise.
        </p>
        {/* The legal pages join the iPhone app here rather than taking a
            fourth column, which would have squeezed the Cardmarket line onto
            two lines. Both are also reachable from the FAQ and the signup
            form; a footer is where a link goes to not be read, and these two
            still have to be somewhere permanent.

            /brand is here for a stronger version of that reason: it is
            noindex and in no sitemap, so this row is the only way anybody
            arrives at it who was not handed the URL. A page nobody can reach
            is a page that stops being true. */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link href="/app/ios" className={navLink}>
            iPhone app
          </Link>
          <Link href="/brand" className={navLink}>
            Brand
          </Link>
          <Link href="/privacy" className={navLink}>
            Privacy
          </Link>
          <Link href="/terms" className={navLink}>
            Terms
          </Link>
        </div>
      </div>
      <div className="flex items-center justify-self-end [@media(max-width:640px)]:justify-self-center">
        <ThemeToggle />
      </div>
    </footer>
  );
}
