import {
  tabbarClassName,
  tabbarFadeClassName,
  tabbarItemClassName,
  tabbarPagesClassName,
} from "../components/tabbarClasses";
import { APP_NAME } from "../../lib/core/config";
import { cardsMainClassName, pageCardsClassName } from "../components/cardsPageClasses";

/**
 * What every signed-in screen shows while the shell is on its way.
 *
 * This is the Suspense fallback for the whole (app) route group — /dashboard,
 * /collection/*, /wishlist, /settings, all of it — because the slow await is in
 * the group's layout, not in any page: force-dynamic, currentViewer() and then
 * nineteen hundred cards out of getCollection(). 200 to 550 ms between the press
 * and the first pixel, in which nothing acknowledged the press at all.
 *
 * **The rule this file exists to keep: it draws only what is identical on every
 * route in the group.** The frame, the rail, the bar. Nothing inside .cards-main
 * except an outline where the heading lands, because that is the only thing
 * every screen in here agrees on.
 *
 * It used to draw a great deal more — a five-control toolbar, two set panels and
 * twenty card tiles — because it was written for the old single-page /cards
 * route and never re-scoped when the group grew around it. /dashboard renders no
 * toolbar and no set grids, /settings renders neither plus no card anything, and
 * the heading here said "Cards", which is a word no screen in the app has ever
 * had at the top of it. So the commonest thing anyone saw was the skeleton of a
 * page that does not exist. See ADR-0044, and ADR-0018 for the same file drifting
 * once before.
 *
 * If a route wants its own shape outlined, it gets its own loading.tsx. It does
 * not get added here.
 */

/**
 * The signed-in rail above 1000px: Dashboard, My collection, Wishlist, a
 * hairline, then Sets and Browse — CardsSidebar.tsx's setsAsRow mode, which is
 * the only mode anything in this group renders. Three and two rather than a run
 * of nine identical outlines, so the rows land where they are drawn.
 *
 * Wishlist is drawn even though the real rail hides it when nothing is wanted
 * (CardsSidebar's `wanted > 0`). A collection with a wishlist is the ordinary
 * case, and it is one row of movement either way.
 */
const RAIL_ABOVE = 3;
const RAIL_BELOW = 2;

/** The hairline between the destinations and the sets. Same markup as the one
 *  in CardsSidebar.tsx, so the rows either side of it are not off by 20px. */
function RailDivider() {
  return <span className="block h-px m-2 bg-[var(--color-border-subtle)]" />;
}

function RailRow() {
  // One .cards-nav-item: 28px of logo/icon slot plus the --space-2 padding
  // either side of it.
  return <span className="skeleton h-11 rounded-md" />;
}

export default function Loading() {
  // The same wrapper the layout uses. Without it the fallback is not inside
  // .page-cards at all, so it ignored the two-pane grid and the outlines ran
  // the full width of the window before snapping into place.
  return (
    // [animation:...]/[transform-origin:...] used to be #main-content
    // > .is-fallback in base.css — the direct-child selector only ever
    // matched this one element, so it's a direct class now.
    <section
      className={`${pageCardsClassName} [animation:pageEnter_420ms_var(--ease-out)] [transform-origin:center_top]`}
    >
      {/* The same heading AppShell renders, word for word and in the same
          position, so the document has exactly one h1 throughout the load
          rather than none until the page lands. It is .sr-only and therefore
          position:absolute, which is why it can sit here without becoming a
          third item in .page-cards's two-column grid — and why the rail and
          .cards-main below it are still literal siblings, which cards.css's
          pane-swap selector requires (see AppShell.tsx). */}
      <h1 className="sr-only">{APP_NAME}</h1>

      <div
        className="cards-rail gap-5 [padding:var(--space-4)_var(--space-3)]
          bg-[var(--glass-bg-solid)] [backdrop-filter:blur(var(--blur-glass-card))]"
        aria-hidden="true"
      >
        {/* The rail's head, above 1000px only, exactly where CardsSidebar puts
            it. It was missing, and it is 60-odd pixels tall: every outline
            below it sat that far above the row it was standing in for, which
            is the one thing a fallback is supposed to get right.

            The wordmark is the real word rather than an outline — it is a
            constant, and a constant drawn as a grey bar is a shape fading into
            itself. Not a <Link>: there is nothing to navigate to yet and a
            fallback should not be pressable. The add button beside it is an
            outline, because it is a control and drawing a dead one invites the
            press it cannot answer. */}
        <div className="flex items-center justify-between gap-2 [padding:0_var(--space-4)_var(--space-4)] [@media(max-width:1000px)]:hidden">
          <span className="text-label [font-family:var(--font-main)] [font-size:var(--fs-label)] [font-weight:var(--fw-button)] tracking-[-0.03em]">
            {APP_NAME}
          </span>
          <span className="skeleton flex-none w-[var(--control-h)] h-[var(--control-h)] rounded-full" />
        </div>

        {/* No "Sets" title here, unlike CardsSidebar. Below 1000px cards.css
            hides `.cards-rail:not([data-pane="rail"])` outright and this rail
            has no data-pane to set — the title could never be seen, and the
            copy this file used to carry for it ("Cards") was the sidebar's
            wrong word anyway. */}
        <div className="cards-nav list-none m-0 p-0 flex flex-col gap-[2px]">
          {Array.from({ length: RAIL_ABOVE }, (_, i) => (
            <RailRow key={`a${i}`} />
          ))}
          <RailDivider />
          {Array.from({ length: RAIL_BELOW }, (_, i) => (
            <RailRow key={`b${i}`} />
          ))}
        </div>

        {/* The avatar footer, pinned to the bottom the same way the real one is
            (CardsSidebar.tsx) — otherwise it arrives out of nowhere at the end
            of the load. Above 1000px only, like the head. */}
        <span
          className="sticky bottom-0 z-[1] mt-auto flex items-center gap-3 w-full p-2 rounded-md
            bg-[var(--glass-bg-solid)] [@media(max-width:1000px)]:hidden"
        >
          <span className="skeleton flex-none w-7 h-7 rounded-full" />
          <span className="skeleton flex-1 h-[var(--fs-small)]" />
        </span>
      </div>

      <section className={cardsMainClassName}>
        <header className="cards-head">
          {/* The one thing every screen in this group has: an h1. What it says
              is the screen's own business — "Dashboard", "Settings", a set
              name, somebody's collection — so it is an outline and not a word.
              Sized to .cards-main-title's line box (cards.css), not to its
              font size. */}
          <span
            className="skeleton w-[220px] max-w-full h-[calc(var(--fs-h2)*var(--lh-tight))] rounded-xs"
            aria-hidden="true"
            role="presentation"
          />
        </header>

        {/* Where the screen lands. One region and not a layout: the count, the
            toolbar and the card grids that used to be here are shapes that
            exist on some screens in this group and not others, and every one of
            them was wrong more often than it was right. This claims the only
            thing all of them share — that something fills this pane, starting
            here — and says nothing about what is in it.

            Sized in vh rather than to a content guess, and capped, so it reads
            as a region on a laptop without becoming a full page of grey on a
            tall monitor. It is the only element here whose height is arbitrary,
            which is the honest description of a placeholder for an unknown.

            No sweep on this one, for the reason the old file gave for card
            scans and which applies with more force to a single large block: a
            band of light travelling across 40px of text bar reads as loading,
            the same band across half the window reads as the page flickering. */}
        <span
          className="skeleton block w-full h-[min(420px,52vh)] rounded-lg after:content-none"
          aria-hidden="true"
          role="presentation"
        />

        {/* One live region for the whole thing rather than a label on every
            outline: a screen reader should hear this once, not six times. The
            word is bare because this stands in for /settings as readily as for
            the collection. */}
        <p className="sr-only" role="status">
          Loading
        </p>
      </section>

      {/* The bar, drawn rather than outlined where it can be: it is the site's
          own chrome and an outline of a constant is a shape fading into itself.

          Four slots and the add circle, which is the signed-in bar
          (CardsTabBar.tsx). The plus used to be left out, on the grounds that
          the fallback could not know whether anyone was signed in — true on
          /cards, not true here: this group's layout redirects a viewerless
          request before it can ever reach this file, so signed-in is a fact and
          not a guess.

          Each slot carries an icon-sized and a label-sized outline rather than
          being empty. Empty, the slots collapsed to about 12px against a real
          slot's 45 and the whole bar changed height the moment it loaded, which
          is exactly the layout movement this file claims not to do.

          Still no sliding pill: which slot it belongs under is the one thing
          here that genuinely depends on where you are going. */}
      <div className={`${tabbarFadeClassName} cards-tabbar-fade`} aria-hidden="true" />
      <nav className={`${tabbarClassName} cards-tabbar`} aria-hidden="true">
        <div
          className={tabbarPagesClassName}
          /**
           * --tab-w, which tabbarItemClassName reads for every slot's width,
           * computed rather than left at its 104px default.
           *
           * The default is deliberately generous (see tabbarClasses.ts: a tight
           * estimate clipped "Dashboard" on a real phone) and the real bar can
           * afford it, because CardsTabBar measures the widest label on mount
           * and writes a smaller value back. This file has no effect and no
           * labels to measure, so it would sit at 104px forever: four slots at
           * 104 plus the 40px circle plus the gaps needs 512px, and a 500px
           * window gives the track 466 — the two end slots hang out of it.
           *
           * So: divide what is actually left between the four, and never go
           * above the default. The 56px is the five gap-2 gaps plus the track's
           * own p-2. min-w-[56px] on the slot floors it, and above roughly
           * 620px the min() picks 104 and nothing here applies at all.
           */
          style={
            {
              "--tab-w":
                "min(104px, calc((100vw - 2*var(--space-4) - var(--control-h) - 56px) / 4))",
            } as React.CSSProperties
          }
        >
          {Array.from({ length: 2 }, (_, i) => (
            <TabSlot key={`l${i}`} />
          ))}
          {/* !cursor-default on this and on every slot: both the shared class
              and .cards-tabbar-add carry cursor:pointer for the real, pressable
              bar, and the track sets pointer-events:auto on its children — so
              without this the fallback's dead shapes offer a pointer to a
              press they cannot answer. */}
          <span className="cards-tabbar-add !cursor-default" />
          {Array.from({ length: 2 }, (_, i) => (
            <TabSlot key={`r${i}`} />
          ))}
        </div>
      </nav>
    </section>
  );
}

/** One slot's footprint: the 20px icon and the --fs-tiny label under it that
 *  every slot carries, whether or not it is the active one. */
function TabSlot() {
  return (
    <span className={`${tabbarItemClassName} !cursor-default`}>
      <span className="skeleton w-5 h-5 rounded-xs" />
      <span className="skeleton w-12 h-[var(--fs-tiny)] rounded-xs" />
    </span>
  );
}
