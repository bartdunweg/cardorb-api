import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import { APP_NAME } from "../../lib/core/config";

/**
 * The one footer, on every page that has one.
 *
 * It was inlined at the bottom of app/page.tsx while the landing page was the
 * only page with a footer at all. /privacy is the second, and a legal page that
 * cannot be reached from anywhere is not published in any useful sense — so the
 * markup moved here rather than being copied, which is how the two would have
 * drifted on the first change to either.
 *
 * Three columns, all of them already spoken for: the wordmark, the Cardmarket
 * attribution, and the theme toggle. The privacy link joins the wordmark rather
 * than taking a fourth column, because it belongs to the same "who this is"
 * group and a four-column grid would have squeezed the middle line onto two.
 */
export default function Footer() {
  return (
    <footer
      className="grid grid-cols-[1fr_minmax(0,1.6fr)_1fr] gap-4 items-start pt-5
        border-t border-[var(--color-border-subtle)] text-label-tertiary
        [font-family:var(--font-body)] [font-size:var(--fs-small)]
        [@media(max-width:640px)]:grid-cols-1 [@media(max-width:640px)]:text-center"
    >
      <div className="flex items-center gap-4 [@media(max-width:640px)]:justify-center">
        <span className="text-label [font-family:var(--font-main)] [font-size:var(--fs-label)] [font-weight:var(--fw-button)] tracking-[-0.03em] no-underline">
          {APP_NAME}
        </span>
        <Link
          href="/privacy"
          // Secondary rather than the footer's own tertiary: it sits beside the
          // wordmark in a row of same-coloured text, and a link that is exactly
          // the colour of the words next to it is a link nobody sees. Both pass
          // AA on this background (5.74 and 4.74), so this is legibility as
          // much as contrast.
          className="text-label-secondary no-underline [transition:color_var(--dur-fast)_var(--ease-smooth)] hover:text-label"
        >
          Privacy
        </Link>
        <Link
          href="/terms"
          className="text-label-secondary no-underline [transition:color_var(--dur-fast)_var(--ease-smooth)] hover:text-label"
        >
          Terms
        </Link>
      </div>
      <p className="m-0 text-center">
        Prices come from Cardmarket, in euros — the market collectors recognise.
      </p>
      <div className="flex items-center justify-self-end [@media(max-width:640px)]:justify-self-center">
        <ThemeToggle />
      </div>
    </footer>
  );
}
