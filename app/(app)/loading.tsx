import Card from "../components/Card";

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
    <section className="page-cards is-fallback">
      <div className="cards-rail" aria-hidden="true">
        {/* The same title CardsSidebar draws, so the sets do not shift down the
            moment the real rail replaces these outlines. Below 1000px this pane
            is off screen on arrival and only the press that opens it brings the
            two together, by which time the fallback is long gone; it is here so
            the two files describe the same rail rather than for that. */}
        <p className="cards-rail-title" aria-hidden="true">
          Cards
        </p>
        <div className="cards-nav">
          {Array.from({ length: RAIL }, (_, i) => (
            <span key={i} className="skeleton cards-skeleton cards-skeleton--nav" />
          ))}
        </div>
      </div>

      <section className="cards-main">
        <header className="cards-head">
          {/* Real, not an outline: the heading is the one thing on this page
              that does not come from Notion. */}
          <h1 className="cards-main-title">Cards</h1>
          <span
            className="skeleton cards-skeleton cards-skeleton--count"
            aria-hidden="true"
            role="presentation"
          />
          <div className="cards-tools" aria-hidden="true">
            <span className="skeleton cards-skeleton cards-skeleton--search" />
            <span className="skeleton cards-skeleton cards-skeleton--segmented" />
            <span className="skeleton cards-skeleton cards-skeleton--segmented" />
            <span className="skeleton cards-skeleton cards-skeleton--filter" />
            <span className="skeleton cards-skeleton cards-skeleton--views" />
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
              <span className="skeleton cards-skeleton cards-skeleton--logo" />
              <div className="cards-set-text">
                <span className="skeleton cards-skeleton cards-skeleton--title" />
                <span className="skeleton cards-skeleton cards-skeleton--meta" />
              </div>
            </div>
            <div className="cards-grid">
              {Array.from({ length: count }, (_, j) => (
                <span key={j} className="cards-item">
                  <span className="cards-scan">
                    <span className="skeleton cards-skeleton cards-skeleton--scan" />
                  </span>
                  <span className="skeleton cards-skeleton cards-skeleton--name" />
                  <span className="skeleton cards-skeleton cards-skeleton--tag" />
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
      <div className="tabbar-fade cards-tabbar-fade" aria-hidden="true" />
      <nav className="tabbar cards-tabbar" aria-hidden="true">
        <div className="tabbar-pages">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="tabbar-item" />
          ))}
        </div>
      </nav>
    </section>
  );
}
