import type { ReactNode } from "react";
import MarketingFooter from "./MarketingFooter";
import Navbar from "./Navbar";

/**
 * The shell both legal documents render into — /privacy and /terms.
 *
 * Extracted the moment there were two of them rather than after they had
 * drifted. A legal page is almost entirely typography, and typography copied
 * between two files is two type scales by the second edit; the repo already
 * settles this the same way elsewhere (tabbarClasses.ts, cardsPageClasses.ts,
 * segmentedClasses.ts).
 *
 * The page keeps its own `metadata` export. Only the chrome and the type are
 * shared, because the robots/canonical/openGraph block genuinely differs per
 * route and hiding it in here would hide the one field that must not be wrong
 * (see the note on `openGraph` in either page).
 */
export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  /** The published date, in both forms. One value, two readers — the visible
   *  line and <time dateTime> — so they cannot disagree the way two hand-typed
   *  dates would. */
  updated: { iso: string; human: string };
  children: ReactNode;
}) {
  return (
    // Cancels the top padding the layout reserves for a floating tab bar these
    // routes do not have, exactly as app/page.tsx and SigninShell.tsx do. The
    // Navbar sits outside the capped section so it can be sticky and full-bleed.
    <div className="-mt-[var(--main-pad-top)]">
      <Navbar />

      <section className="w-[min(100%,1180px)] mx-auto [padding:0_var(--page-pad-x)_var(--page-pad-bottom)]">
        {/* --content-max is 860px, which tokens.css defines as ~70 characters a
            line at 16px and which nothing consumed until these pages. It is the
            reason this article is not the 1180px the landing page uses: nobody
            reads a legal document set the full width of a desktop. */}
        <article className="max-w-[var(--content-max)] mx-auto [padding-block:clamp(56px,8vw,96px)]">
          <h1
            className="mt-0 mb-3 text-primary [font-family:var(--font-main)] [font-weight:var(--fw-title)]
              tracking-[-0.045em] [line-height:var(--lh-tight)] [font-size:var(--fs-display)]"
          >
            {title}
          </h1>
          <p className="m-0 text-tertiary [font-family:var(--font-body)] [font-size:var(--fs-small)]">
            Last updated <time dateTime={updated.iso}>{updated.human}</time>
          </p>
          {children}
        </article>

        <MarketingFooter />
      </section>
    </div>
  );
}

/**
 * The type for long-form text, as class strings rather than a plugin.
 *
 * No @tailwindcss/typography: this repo is Tailwind v4 CSS-first with
 * hand-rolled tokens, and a plugin would put a third opinion into the cascade
 * layers ADR-0012 and ADR-0013 exist to keep ordered. Preflight strips heading
 * sizes and list markers anyway, so every element states its own type.
 */
export const legal = {
  h2:
    "mt-12 mb-3 text-primary [font-family:var(--font-main)] [font-weight:var(--fw-title)] " +
    "tracking-[-0.03em] [line-height:var(--lh-tight)] [font-size:var(--fs-h2)]",
  h3:
    "mt-7 mb-2 text-primary [font-family:var(--font-main)] [font-weight:var(--fw-title)] " +
    "tracking-[-0.02em] [line-height:var(--lh-snug)] [font-size:var(--fs-sub)]",
  // --lh-relaxed, which tokens.css names "long-form body" and which nothing in
  // this app had a use for until these two pages.
  body:
    "mt-0 mb-4 text-secondary [font-family:var(--font-body)] " +
    "[font-size:var(--fs-body-l)] [line-height:var(--lh-relaxed)]",
  link:
    "text-primary underline [text-underline-offset:2px] " +
    "[transition:color_var(--dur-fast)_var(--ease-smooth)] hover:text-secondary",
  /** Emphasis inside body text, which is otherwise --color-label-secondary. */
  strong: "text-primary",
};

// Spacing via a margin on each item rather than `grid gap-2`, which is how the
// lists on the landing page do it: a `display: grid` <ul> blockifies its <li>
// children, and a blockified list item is not `display: list-item`, so the
// markers these lists actually want would silently disappear.
export const legalList = `${legal.body} list-disc [padding-inline-start:var(--space-6)] [&>li]:mb-2 [&>li:last-child]:mb-0`;
