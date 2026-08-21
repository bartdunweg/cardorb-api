/**
 * .page-cards from app/styles/cards.css — the full-bleed two-pane shell,
 * shared by app/(app)/layout.tsx (owner) and app/user/[username]/page.tsx
 * (public). The negative top margin takes back --main-pad-top, which
 * reserves room for a tab bar this route deliberately does not have.
 *
 * No bottom padding here any more — it moved onto .cards-main
 * (cardsMainClassName) alone. On the container, it sat *below* both grid
 * tracks rather than inside either one, so the sticky rail (constrained to
 * its own track) fell short of it: scrolled to the end, that padding showed
 * as a full-width gap with no rail border through it, reading as "the
 * sidebar does not reach the bottom." Giving the main column its own
 * trailing space instead keeps that breathing room without the rail's track
 * ending early.
 *
 * `bg-secondary`, the same canvas app/layout.tsx paints on html and body.
 * It was `bg-primary` — the card colour — so the signed-in half of the app
 * stood on a different surface from the landing page, and the rail, the set
 * panels and the grid hover pill (all `bg-primary` themselves) had nothing to
 * stand out against. Untitled UI's system is one tint for the page and another
 * for anything raised above it; this is the page, so it is the page's tint. A
 * route that wants the raised colour asks for `bg-primary` on its own box.
 */
export const pageCardsClassName =
  "grid grid-cols-[300px_minmax(0,1fr)] items-start bg-secondary min-h-screen min-h-dvh " +
  "[margin:calc(-1*var(--main-pad-top))_auto_0] " +
  "[@media(max-width:1000px)]:grid-cols-[minmax(0,1fr)] " +
  "[@media(max-width:640px)]:[margin-top:0]";

/**
 * .cards-main from cards.css. The class name stays (not just the Tailwind
 * utilities): cards.css's container queries throughout the file measure
 * against this box by name (`container-type: inline-size` needs a name-based
 * selector target for `@container` to bind to at every call site), and the
 * mobile pane-swap is written as the sibling selector
 * `.cards-rail[data-pane="rail"] + .cards-main` — remove the name and both
 * break silently. AppShell.tsx's own comment calls this out: the rail and
 * .cards-main must stay literal siblings, in that order.
 *
 * No `flex`/`flex-col` here on purpose, even though the base rule sets them:
 * `display` is exactly the property the pane-swap sibling selector toggles
 * to `none`, and an unconditional Tailwind utility for it would outrank that
 * CSS regardless of the CSS's specificity (ADR-0012). display/flex-direction
 * stay in cards.css; only the properties nothing ever resets are Tailwind.
 */
export const cardsMainClassName =
  /* flex/flex-col were the last two declarations left in cards.css's own
     `.cards-main` rule, and they are what `gap-5` is a gap *of*. They came
     across when that rule went. */
  "cards-main @container flex flex-col min-w-0 gap-5 " +
  /* The other half of the pane swap, as a peer variant of the rail beside it.
     Was `.cards-rail[data-pane="rail"] + .cards-main { display: none }` and the
     matching animation rule; the sibling relationship is now `peer-data-`,
     which needs the rail to carry `peer` and to come first — the same
     "nothing between these two" constraint AppShell already documents. */
  /* `!`, because `flex` above is unconditional and `hidden` here is not: two
     display utilities, and the order Tailwind emits them is not a promise. The
     same fix as ADR-0012's and the card body's. */
  "[@media(max-width:1000px)]:peer-data-[pane=rail]:!hidden " +
  "[@media(max-width:1000px)]:peer-data-[pane=main]:[animation:cards-pane-in_200ms_var(--ease-out)] " +
  "motion-reduce:animate-none " +
  "pt-8 pr-[var(--page-pad-x)] pb-[var(--page-pad-bottom)] pl-6 " +
  // Every part carries the variant. Splitting a `padding` shorthand into three
  // utilities is only safe if the prefix goes on all three — the first pass left
  // it on `pt-5` alone and the other two became unconditional, which moved the
  // narrow layout by a few pixels on four screens. Caught by the harness.
  "[@media(max-width:1000px)]:pt-5 [@media(max-width:1000px)]:px-[var(--page-pad-x)] " +
  "[@media(max-width:1000px)]:pb-[var(--page-pad-bottom)] " +
  "[@media(min-width:641px)_and_(max-width:1000px)]:[padding-bottom:calc(calc(var(--spacing)*6)+var(--tabbar-pill-h)+calc(var(--spacing)*10))]";

/**
 * The same three controls twice, and never both on screen: a panel where the
 * page is visible around it (ViewMenu/FilterMenu), a sheet where it is not
 * (ViewSheet/FilterSheet). Swapped in the stylesheet rather than by measuring
 * the window, so the server renders one markup and the browser does not
 * correct it after hydration — hence a display toggle rather than a
 * conditional render, in CardsView.tsx.
 */
export const onlyWideClassName = "[@media(max-width:640px)]:hidden";
export const onlyNarrowClassName = "hidden [@media(max-width:640px)]:contents";

/**
 * The set header above each grid: a logo, the set's name, and its counts.
 *
 * First portion of the cards.css migration to be moved under the visual harness
 * added in ADR-0051. Chosen because it is the safest shape there is here — five
 * classes, one consumer (CardsView), and not one descendant selector, so the
 * markup does not move and only the styling does. The families that style a
 * child from the parent's class are the ones that broke this migration four
 * times; none of those are in here.
 *
 * The 640px step-down was two rules in a media query and is `max-sm:` here. It
 * is the part most worth checking after any edit: a dropped breakpoint looks
 * perfect at every width except the one nobody has open.
 */
export const cardsSetHeadClassName = "cards-set-head flex items-center gap-4 mb-6 max-sm:mb-5";

/** Fixed box so a missing logo does not reflow the row; stepped down under 640. */
export const cardsSetLogoClassName =
  "cards-set-logo h-11 w-40 object-contain object-left shrink-0 " +
  "max-sm:h-[34px] max-sm:w-30";

export const cardsSetTextClassName = "cards-set-text flex flex-col gap-0.5 min-w-0";

export const cardsSetNameClassName =
  "cards-set-name m-0 font-body font-medium " +
  "text-display-xs leading-tight text-primary";

/** Tabular so the counts line up down the page. */
export const cardsSetMetaClassName =
  "cards-set-meta m-0 font-body text-xs " +
  "text-tertiary lining-nums tabular-nums";

/**
 * The heading row and the toolbar under it — second portion of the cards.css
 * migration (ADR-0051).
 *
 * The spacing numbers are Tailwind's own scale rather than arbitrary values,
 * because this project's tokens already agree with it: --space-2 through
 * --space-6 are 8, 12, 16, 20 and 24px, which is `2`..`6` exactly. Where a
 * value is off the scale — the logo's 132px and its 30px step-down — it stays
 * arbitrary rather than being rounded to something that looks close.
 */
export const cardsHeadTitleClassName = "cards-head-title flex items-center gap-4 min-w-0";

/** Fixed box for the same reason the set logo has one: `width: auto` is zero
 *  wide until the file arrives. Stepped down under 640. */
export const cardsHeadLogoClassName =
  "cards-head-logo h-10 w-[132px] object-contain object-left shrink-0 " +
  "max-sm:h-[30px] max-sm:w-24";

/**
 * `max-sm:[&_.btn]:flex-[0_0_auto]` is a descendant selector kept as one, and
 * it is the first of the forty in this file to be translated rather than
 * avoided.
 *
 * The alternative was putting `flex-none` on each button in the toolbar's
 * markup. That looks tidier and is worse: `.btn` is shared across the whole app,
 * the rule is scoped to *buttons inside this bar at this width*, and moving it
 * onto the elements means every future button added here has to remember. The
 * variant keeps the scope identical to what the CSS said.
 */
export const cardsToolsClassName =
  "cards-tools flex items-center flex-wrap gap-3 w-full mt-5 " + "max-sm:[&_.btn]:flex-[0_0_auto]";

/**
 * Two rules in cards.css, merged here: the base, and a later top-level
 * `margin-top` added when this moved from the toolbar up to the heading. Merged
 * rather than kept apart because source order was the only thing making the
 * second win, and that is not a thing to preserve.
 */
export const cardsCountClassName =
  "cards-count m-0 mt-2 font-body text-xs " +
  "text-tertiary lining-nums tabular-nums";

/**
 * The last of the simple ones — third and final portion under ADR-0051's
 * harness. See ADR-0052 for where this migration stops and why.
 */
export const cardsSetClassName = "cards-set flex flex-col";

/**
 * One pixel, and it must stay exactly that.
 *
 * An element of zero height has no box for an IntersectionObserver to intersect
 * with once it is the last child of a flex column, and the infinite build-out
 * simply stops — with no error, the grid just ends. Deliberately not on the
 * spacing scale: it is not a spacer and must never read as one.
 * lib/design/mechanics.test.ts guards it.
 */
export const cardsMoreClassName = "cards-more h-px";

/** Hidden below 1000px, where the rail collapses and these links move into the bar. */
export const cardsNavElsewhereClassName = "cards-nav-elsewhere max-[1000px]:hidden";

/**
 * The signed-in chrome — the last portion, and the one that needed a session
 * before it could be moved at all. See ADR-0051 for why, and ADR-0020 for the
 * bug that hid on exactly these routes.
 */

/** Lifted above the cards below it: each of those is its own stacking context
 *  (backdrop-filter), so without this a later sibling paints over an open
 *  filter panel however high that panel's own z-index is. */
export const cardsHeadClassName = "cards-head relative z-[2] flex flex-col items-start";

/**
 * `overflow-wrap: anywhere` is the load-bearing part and the reason this is not
 * just a font declaration. The heading used to hold curated strings — set names,
 * era labels. On a public profile it holds "<display name>’s collection", up to
 * sixty characters somebody typed, and one long unbroken word ran past the edge
 * of the pane. The rail's copy of the same label truncates; a page heading
 * should wrap instead, so it breaks the word.
 */
export const cardsMainTitleClassName =
  // Untitled UI's page title (ADR-0061). `overflow-wrap` is the part that is not
  // theirs and must not be dropped — see the paragraph above; it is why this is
  // a constant rather than the utility string written at each call site.
  "cards-main-title m-0 text-display-xs font-semibold text-primary [overflow-wrap:anywhere]";

/**
 * A loading placeholder: the block, and the light that sweeps across it.
 *
 * Was `.skeleton` in components.css, with four `nth-child` rules staggering the
 * sweep so a row of them does not pulse in unison. Tailwind expresses all of it
 * — `after:` for the sweep, `nth-[4n+2]:` and friends for the stagger — so the
 * only thing that had to stay in CSS is the @keyframes itself, which is in
 * globals.css beside the other two.
 *
 * The colours are Untitled UI's now: their tertiary background for the block,
 * and their primary surface at low opacity for the light moving over it.
 */
export const skeletonClassName = [
  "relative overflow-hidden rounded-md bg-tertiary",
  "after:absolute after:inset-0 after:content-['']",
  "after:[background:linear-gradient(90deg,transparent_0%,var(--color-bg-primary)_50%,transparent_100%)]",
  "after:opacity-60 after:-translate-x-full",
  "after:[animation:skeleton-sweep_1.4s_var(--ease-in-out)_infinite]",
  // A row of these pulsing in unison reads as one object flashing rather than
  // several things loading. Staggered by an eighth of the sweep each.
  "nth-[4n+2]:after:[animation-delay:0.15s]",
  "nth-[4n+3]:after:[animation-delay:0.3s]",
  "nth-[4n+4]:after:[animation-delay:0.45s]",
  "motion-reduce:after:animate-none motion-reduce:after:opacity-0",
].join(" ");
