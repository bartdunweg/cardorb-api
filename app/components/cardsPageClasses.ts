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
 */
export const pageCardsClassName =
  "grid grid-cols-[300px_minmax(0,1fr)] items-start bg-[var(--glass-bg-solid)] min-h-screen min-h-dvh " +
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
  "cards-main @container min-w-0 gap-5 " +
  "[padding:var(--space-8)_var(--page-pad-x)_var(--page-pad-bottom)_var(--space-6)] " +
  "[@media(max-width:1000px)]:[padding:var(--space-5)_var(--page-pad-x)_var(--page-pad-bottom)] " +
  "[@media(min-width:641px)_and_(max-width:1000px)]:[padding-bottom:calc(var(--space-6)+var(--tabbar-pill-h)+var(--space-10))]";

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
  "cards-set-logo h-11 w-40 object-contain [object-position:left_center] shrink-0 " +
  "max-sm:h-[34px] max-sm:w-30";

export const cardsSetTextClassName = "cards-set-text flex flex-col gap-0.5 min-w-0";

export const cardsSetNameClassName =
  "cards-set-name m-0 [font-family:var(--font-main)] [font-weight:var(--fw-title)] " +
  "[font-size:var(--fs-card)] [line-height:var(--lh-tight)] text-label";

/** Tabular so the counts line up down the page. */
export const cardsSetMetaClassName =
  "cards-set-meta m-0 [font-family:var(--font-body),sans-serif] [font-size:var(--fs-small)] " +
  "text-label-tertiary [font-variant-numeric:lining-nums_tabular-nums]";
