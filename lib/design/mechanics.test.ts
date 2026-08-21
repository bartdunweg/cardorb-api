import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Not a style test. A test that some lines still exist.
 *
 * This is an unusual thing to write and it earns its place for one reason:
 * every rule below was a bug once, and every one of them looks removable to
 * anybody who did not see the bug. A negative margin of exactly −10px, −20px,
 * −26px reads as a hack. A rule that says `height: 1px` reads as a spacer
 * somebody forgot to delete. `container-type: inline-size` on a box with no
 * visible container query beside it reads as a leftover.
 *
 * The stylesheets explain all of it, at length, and that was the whole defence
 * until now — and the two test files those comments cite are gone from the
 * repo, so the defence had already failed once without anyone noticing.
 *
 * A CSS rebuild is coming. During it, thousands of lines move between files by
 * hand. This is the net under that: if one of these disappears, CI says which
 * one and why it mattered, in the words of whoever paid for it.
 *
 * When a rule legitimately moves to a new file, change the path here. When one
 * is legitimately deleted, delete its case — and the deletion will be visible
 * in review, which is the point. What must not happen is a rule quietly
 * evaporating in a diff of two thousand lines.
 */

const read = (path: string) => readFileSync(path, "utf8");

/**
 * `app/styles/cards.css` is gone — every rule in it is a Tailwind class on the
 * element that draws it now, and the two holo attachment rules moved to
 * poke-holo.css where the effect lives.
 *
 * The assertions below were written against that file and are kept, because
 * what they assert is still true and still worth holding: they just read the
 * class strings instead. An empty string stands in where the stylesheet used
 * to be, so a rule moving *back* into CSS would fail loudly rather than
 * silently satisfying a regex.
 */
const CARDS_CSS = "";

/** Whitespace-insensitive, so reformatting is not a failure. */
const has = (css: string, pattern: RegExp) => pattern.test(css.replace(/\s+/g, " "));

describe("the grid measures its own column, not the window", () => {
  const css = CARDS_CSS;

  it("keeps container-type on .cards-main", () => {
    // Moved from cards.css's own rule to cardsPageClasses.ts's Tailwind
    // `@container` class (which is exactly `container-type: inline-size`)
    // during the Tailwind migration (ADR-0012's follow-up fixes).
    const classes = read("app/components/cardsPageClasses.ts");
    expect(
      has(classes, /cards-main[^"]*@container/) || has(classes, /@container[^"]*cards-main/),
      "Every card-grid breakpoint is measured against this box rather than the " +
        "viewport, because at 1000px and at 660px the grid has almost exactly " +
        "the same width and the old viewport rules gave them different tiles.",
    ).toBe(true);
  });

  it("keeps both container queries that answer to it", () => {
    // They are anonymous — they resolve against .cards-main by ancestry alone.
    // Put container-type on the wrong box and these silently become
    // viewport-ish again, which is the failure that has no error message.
    // Both are Tailwind @max-[560px]: variants now — the Pokédex's moved first,
    // the grid's followed when .cards-grid left cards.css. They still resolve
    // against the same .cards-main ancestor container, which is what the test
    // above is for. The CSS branch stays counted so a move back is not a
    // failure; it is the total that matters.
    const cssQueries = css.match(/@container\s*\(max-width:\s*560px\)/g) ?? [];
    const tailwind = ["app/components/CardsPokedex.tsx", "app/components/CardsView.tsx"]
      .map(read)
      .join("\n");
    const tailwindQueries = tailwind.match(/@max-\[560px\]:/g) ?? [];
    expect(
      cssQueries.length + tailwindQueries.length,
      "the grid and the Pokédex each answer to .cards-main",
    ).toBeGreaterThanOrEqual(2);
  });
});

describe("paint containment does not slice the shadows off the scans", () => {
  // .cards-grid is a Tailwind class string in CardsView now, so both halves of
  // the pair are read from there. Kept as one assertion over both files so the
  // pair cannot be split by moving one half back.
  const css = CARDS_CSS + "\n" + read("app/components/CardsView.tsx");

  it("keeps content-visibility paired with the bleed it forced", () => {
    // content-visibility brings paint containment with it, and paint
    // containment clips to the padding box — so the scans' drop-shadow, which
    // reaches 18px sideways and 26 below, was sliced in a straight line down
    // both edges of the grid and along the bottom of every row. The negative
    // margin and the padding that answers it are one fix, measured against the
    // drop-shadow. If either moves, both move.
    expect(
      has(css, /content-visibility:\s*auto/),
      "the one cheap thing that helps a phone through 1,900 cards",
    ).toBe(true);
    expect(
      // Three spellings, one fact. It was a CSS rule, then an arbitrary Tailwind
      // pair, and now the plain scale — 10px is 2.5, 20px is 5, 26px is 6.5, so
      // the measured distances survive the move to utilities exactly.
      has(css, /margin:\s*-10px -20px -26px;\s*padding:\s*10px 20px 26px/) ||
        has(css, /\[margin:-10px_-20px_-26px\][^"]*\[padding:10px_20px_26px\]/) ||
        has(css, /-mx-5 -mt-2\.5 -mb-6\.5[^"]*px-5 pt-2\.5 pb-6\.5/),
      "the bleed pair that keeps paint containment from clipping the scans' shadow",
    ).toBe(true);
  });
});

describe("the scans land in a box that was already the right shape", () => {
  it("keeps the real scan ratio", () => {
    // 245/342 is TCGdex's actual scan dimension. Fixed by ratio rather than by
    // content because the scans stream in lazily, and without a box to land in
    // every arrival would reflow the rows below it. Every consumer moved to a
    // Tailwind aspect-[245/342] class during the migration: the grid tile
    // (CardItem.tsx), the detail-page scan and its missing-scan placeholder
    // (CardDetail.tsx), and the Pokédex slot's artwork (CardsPokedex.tsx).
    for (const path of [
      "app/components/CardItem.tsx",
      "app/components/CardDetail.tsx",
      "app/components/CardsPokedex.tsx",
    ]) {
      expect(
        has(read(path), /aspect-\[245\/342\]/),
        `the lazy-loading reflow guard in ${path}`,
      ).toBe(true);
    }
  });

  it("keeps the two-value percentage radius on the placeholder", () => {
    // The corner radius of a real card is a percentage of its width, so at
    // every size in the grid the empty slot stays the same shape as the scans
    // beside it. There is no fixed radius that does this.
    // Moved to a Tailwind rounded-[4.5%/3.2%] class on CardDetail.tsx's
    // missing-scan placeholder — the last consumer of .cards-scan-missing.
    const cardDetail = read("app/components/CardDetail.tsx");
    expect(has(cardDetail, /rounded-\[4\.5%\/3\.2%\]/), "placeholder matches a real card").toBe(
      true,
    );
  });
});

describe("the things that would look like leftovers", () => {
  // No `read("app/styles/cards.css")` here any more, and that is the finding
  // rather than a tidy-up: both guarantees this block protects — the build-out
  // tripwire and the set logo's stated width — followed their classes out of
  // the stylesheet during the migration. A describe named for CSS leftovers
  // that reads no CSS is the migration having actually landed.

  it("keeps the IntersectionObserver tripwire at exactly 1px", () => {
    // An element of zero height has no box for an IntersectionObserver to
    // intersect with once it is the last child of a flex column. Delete this
    // and the infinite build-out stops — with no error, the grid simply ends.
    // Deliberately not on the spacing scale: it is not a spacer and must never
    // read as one.
    //
    // Moved to cardsMoreClassName in cardsPageClasses.ts with the last portion
    // of the cards.css migration (ADR-0052). `h-px` is that same single pixel.
    // The second design test in this file to follow a class out of the
    // stylesheet, which is the argument for these tests existing: nothing else
    // would have noticed the guarantee had changed address.
    const cardsPageClasses = read("app/components/cardsPageClasses.ts");
    expect(
      has(cardsPageClasses, /cardsMoreClassName[\s\S]*?\bh-px\b/),
      "the build-out tripwire",
    ).toBe(true);
  });

  it("keeps a stated width on the set logos", () => {
    // A loading fix wearing the clothes of a layout preference: with
    // `width: auto` the box is zero wide until the file loads, and the file
    // never loads, so none of them ever appeared.
    //
    // Moved to cardsSetLogoClassName in cardsPageClasses.ts with the set-header
    // family (ADR-0051's first portion); cards.css no longer defines the class.
    // `w-40` is 10rem, which is the same 160px — the guarantee did not change,
    // only where it is written. This test finding the move is the point: it is
    // the kind of second consumer ADR-0018 is about, and it is a *test* reading
    // the stylesheet, which no grep for className would have turned up.
    const cardsPageClasses = read("app/components/cardsPageClasses.ts");
    expect(
      has(cardsPageClasses, /cardsSetLogoClassName[\s\S]*?\bw-40\b/),
      "logos load at all",
    ).toBe(true);
  });

  it("keeps display:contents on the narrow/wide pair", () => {
    // The SSR-correctness device. Rendering one of them from a measured window
    // would mean the server picks wrong and the browser corrects it a frame
    // later, in the toolbar, in front of you. `contents` rather than `block`
    // is what keeps the flex row intact.
    //
    // Moved to onlyNarrowClassName in cardsPageClasses.ts during the Tailwind
    // migration — cards.css no longer defines .only-narrow/.only-wide at all.
    const cardsPageClasses = read("app/components/cardsPageClasses.ts");
    expect(
      has(cardsPageClasses, /onlyNarrowClassName\s*=\s*"[^"]*\bcontents\b/),
      "no layout flash",
    ).toBe(true);
  });
});

describe("the fixed bar does not flinch when a modal opens", () => {
  // Moved from app/styles/tabbar.css to app/components/tabbarClasses.ts's
  // exported class-name strings during the Tailwind migration (ADR-0009).
  const tabbar = read("app/components/tabbarClasses.ts");

  it("keeps the --lock-vw consumers", () => {
    // A position:fixed element measures itself against the viewport, not
    // against the body the modal just pinned. So the bar along the bottom lost
    // four pixels the moment a card was opened and got them back when it
    // closed: a flinch under your thumb. Modal.tsx publishes the pre-lock
    // width; this is the half that reads it.
    expect(has(tabbar, /var\(--lock-vw/), "the bar keeps its width while a modal is open").toBe(
      true,
    );
  });
});

describe("the Safari fixes, which look like superstition and are not", () => {
  it("keeps the tab bar on its own layer", () => {
    // Overscroll makes the bar flicker, because it rasterises together with
    // the fade strip's backdrop-filter. This is a fix rather than a look.
    // tabbarClassName is the exported string carrying this now (was the
    // `.tabbar { transform: translateZ(0) }` rule in tabbar.css).
    expect(
      // `transform-gpu` is Tailwind's spelling of `translateZ(0)`; the class
      // string said it the long way until the arbitrary-value sweep. Both
      // accepted, because the assertion is about the compositing layer existing.
      has(
        read("app/components/tabbarClasses.ts"),
        /tabbarClassName\s*=[^;]*(translateZ\(0\)|transform-gpu)/s,
      ),
      "no flicker on overscroll in Safari",
    ).toBe(true);
  });

  it("keeps the background on html as well as body", () => {
    // Safari paints the rubber-band area past the top and bottom of the page
    // from the canvas, so body alone leaves a pale strip at the edges. Moved
    // from base.css's `html`/`body` rules to Tailwind classes directly on
    // those elements in layout.tsx during the Tailwind migration (ADR-0011).
    //
    // The class is `bg-secondary` now — Untitled UI calls the page background
    // secondary and a card primary, which is the opposite way round from the
    // names this project used. Both spellings are accepted so the assertion is
    // about the fact (two elements carry it) rather than about the vocabulary.
    const layout = read("app/layout.tsx");
    expect(
      (layout.match(/bg-bg-grouped|bg-secondary/g) ?? []).length,
      "both html and body carry the page background",
    ).toBeGreaterThanOrEqual(2);
  });

  it("keeps the scrollbar gutter stable", () => {
    // Otherwise the centred bottom bar shifts between a route that scrolls and
    // one that does not.
    expect(has(read("app/layout.tsx"), /\[scrollbar-gutter:stable\]/), "no shift").toBe(true);
  });
});

describe("motion stops rather than flickering", () => {
  it("keeps the iteration-count reset in the reduced-motion block", () => {
    // The subtlety, and the one sanctioned !important in the codebase: an
    // infinite animation shortened to 0.01ms flickers instead of stopping.
    const pages = read("app/styles/pages.css");
    expect(
      has(pages, /animation-iteration-count:\s*1\s*!important/),
      "infinite animations stop rather than strobe",
    ).toBe(true);
  });
});

describe("the foil is left alone", () => {
  const holo = read("app/styles/poke-holo.css");

  it("keeps the shadow-DOM piercing that is the only way in", () => {
    // hover-tilt writes its variables inline on an element inside its shadow
    // root, and an inline declaration there beats anything set on the host. So
    // ::part() is not a preference; it is the only reachable surface.
    expect(has(holo, /::part\(/), "the join between the tilt and the foil").toBe(true);
  });

  it("keeps the blend recipe", () => {
    // Three stacked gradients, two blend modes and a filter. There is no
    // utility-class expression of this, which is exactly why the file is
    // excluded from the rebuild rather than converted by it.
    expect(has(holo, /mix-blend-mode:\s*color-dodge/), "the foil").toBe(true);
    expect(has(holo, /background-blend-mode:\s*hue,\s*hard-light/), "the foil").toBe(true);
  });

  it("keeps the descender fix on the host", () => {
    // The host was 5px taller than the card it holds, and the 5px is a
    // descender.
    expect(has(holo, /\.poke-tilt\s*\{[^}]*line-height:\s*0/), "no 5px gap under every card").toBe(
      true,
    );
  });
});
