import Card from "../components/Card";
import {
  tabbarClassName,
  tabbarFadeClassName,
  tabbarItemClassName,
  tabbarPagesClassName,
} from "../components/tabbarClasses";
import { cardsMainClassName, pageCardsClassName } from "../components/cardsPageClasses";

/**
 * What /cards shows while the collection is on its way.
 *
 * This is the only route in the site with one, and the exception is deliberate.
 * A fallback blanks the current page for a few hundred milliseconds, which on a
 * small fast route reads as a flash for no reason (see the note in TabBar).
 * This route is the heavy one: nineteen hundred cards, and 200 to 550 ms
 * between the press and the first set depending on the connection. In that gap
 * nothing acknowledged the press at all, which is what a dead button looks
 * like.
 *
 * So it is not a spinner. It is the real page's frame: the rail on the left,
 * the heading and toolbar on the right, with an outline anywhere the shape has
 * to come from Notion. Nothing moves when the real page arrives; the outlines
 * fill in.
 */

// Enough sets to reach the bottom of a laptop rail, and the list scrolls
// anyway, so there is nothing to gain from standing in for all fifty-one.
const RAIL = 9;
// Two sets is enough to read as "a page of cards is coming" on a laptop, and
// the second is already below the fold on a phone.
const SETS = [12, 8];

export default function Loading() {
  // The same wrapper page.tsx uses. Without it the fallback is not inside
  // .page-cards at all, so it ignored the two-pane grid and the outlines ran
  // the full width of the window before snapping into place.
  return (
    // [animation:...]/[transform-origin:...] used to be #main-content
    // > .is-fallback in base.css — the direct-child selector only ever
    // matched this one element, so it's a direct class now.
    <section
      className={`${pageCardsClassName} [animation:pageEnter_420ms_var(--ease-out)] [transform-origin:center_top]`}
    >
      <div
        className="cards-rail gap-5 [padding:var(--space-4)_var(--space-3)]
          bg-[var(--glass-bg-solid)] [backdrop-filter:blur(var(--blur-glass-card))]"
        aria-hidden="true"
      >
        {/* The same title CardsSidebar draws, so the sets do not shift down the
            moment the real rail replaces these outlines. Below 1000px this pane
            is off screen on arrival and only the press that opens it brings the
            two together, by which time the fallback is long gone; it is here so
            the two files describe the same rail rather than for that. */}
        <p
          className="hidden [@media(max-width:1000px)]:block [@media(max-width:1000px)]:mb-4
            [@media(max-width:1000px)]:p-2 [@media(max-width:1000px)]:[font-family:var(--font-main)]
            [@media(max-width:1000px)]:[font-weight:var(--fw-title)] [@media(max-width:1000px)]:[font-size:var(--fs-h2)]
            [@media(max-width:1000px)]:[line-height:var(--lh-tight)] [@media(max-width:1000px)]:text-label"
          aria-hidden="true"
        >
          Cards
        </p>
        <div className="cards-nav list-none m-0 p-0 flex flex-col gap-[2px]">
          {Array.from({ length: RAIL }, (_, i) => (
            // One row in the rail: a set logo beside a single line of text,
            // which is the 28px art plus the --space-2 padding a
            // .cards-nav-item is built from.
            <span key={i} className="skeleton h-11 rounded-md" />
          ))}
        </div>
      </div>

      <section className={cardsMainClassName}>
        <header className="cards-head">
          {/* Real, not an outline: the heading is the one thing on this page
              that does not come from Notion. */}
          <h1 className="cards-main-title">Cards</h1>
          {/* Matches .cards-count, which sits under the heading with the same
              gap. Height is the line box of a --fs-small paragraph, not the
              font size — smaller below 640px, where the real count wraps to
              one line instead of sitting beside the heading. */}
          <span
            className="skeleton w-[150px] h-4 mt-2 [@media(max-width:640px)]:h-[var(--fs-small)]"
            aria-hidden="true"
            role="presentation"
          />
          <div className="cards-tools" aria-hidden="true">
            {/* Not greedy: it took the whole leftover width and dwarfed the
                controls beside it, when the collection is mostly browsed by
                filter. */}
            <span className="skeleton flex-[0_1_260px] min-w-[180px] h-[var(--control-h)] rounded-pill" />
            {/* The real .cards-segmented goes full width below 640px, so its
                outline has to as well: a fixed 232px both missed the
                geometry it is standing in for and was wider than the card on
                a 320px screen. */}
            <span className="skeleton w-[232px] h-[var(--control-h)] rounded-pill [@media(max-width:640px)]:w-full" />
            <span className="skeleton w-[232px] h-[var(--control-h)] rounded-pill [@media(max-width:640px)]:w-full" />
            <span className="skeleton w-[104px] h-[var(--control-h)] rounded-pill" />
            <span className="skeleton w-[74px] h-[var(--control-h)] rounded-pill" />
          </div>
        </header>

        {/* One live region for the whole thing rather than a label on every
            outline: a screen reader should hear that the collection is loading
            once, not twenty times. */}
        <p className="sr-only" role="status">
          Loading the collection
        </p>

        {SETS.map((count, i) => (
          <Card key={i} className="cards-set" aria-hidden="true">
            <div className="cards-set-head">
              <span className="skeleton w-[120px] h-11 flex-shrink-0 [@media(max-width:640px)]:w-[92px] [@media(max-width:640px)]:h-[34px]" />
              <div className="cards-set-text">
                <span className="skeleton w-[180px] h-[var(--fs-card)]" />
                <span className="skeleton w-[110px] h-[var(--fs-small)] mt-1" />
              </div>
            </div>
            <div className="cards-grid">
              {Array.from({ length: count }, (_, j) => (
                <span
                  key={j}
                  className="cards-item flex flex-col gap-[2px] min-w-0 relative p-2 rounded-md"
                >
                  <span className="cards-scan block relative aspect-[245/342] mb-2">
                    {/* Fills the slot the scan will land in, so the grid is
                        already the right height and the rows below do not
                        move. No sweep on this one: a band of light travelling
                        across a 40px text bar reads as loading; the same band
                        across a dozen card-sized blocks reads as the page
                        flickering. The small bars below keep the sweep, this
                        one just sits there and waits. */}
                    <span className="skeleton w-full h-full rounded-xs after:content-none" />
                  </span>
                  <span className="skeleton w-[70%] h-[var(--fs-small)]" />
                  <span className="skeleton w-14 h-[17px] mt-1 rounded-pill" />
                </span>
              ))}
            </div>
          </Card>
        ))}
      </section>

      {/* The bar, drawn rather than outlined: it is the site's own chrome and
          none of it comes from Notion, so an outline here would be a shape
          fading into itself. No pill and no plus, which are the two things
          that depend on where you are and whether you are signed in: the
          fallback knows neither, and guessing at either is the fallback
          changing its mind while you watch.

          Below 1000px only, the same as the real one, and the same trick
          /favorites/[kind]/loading.tsx uses: the fallback and the page share
          chrome so a colour arrives rather than a layout moving. */}
      <div className={`${tabbarFadeClassName} cards-tabbar-fade`} aria-hidden="true" />
      <nav className={`${tabbarClassName} cards-tabbar`} aria-hidden="true">
        <div className={tabbarPagesClassName}>
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className={tabbarItemClassName} />
          ))}
        </div>
      </nav>
    </section>
  );
}
