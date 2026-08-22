import { APP_NAME } from "@/lib/core/config";
import { Mark } from "@/components/shared/Wordmark";

/**
 * What every signed-in screen shows while the shell is on its way.
 *
 * This is the Suspense fallback for the whole (app) route group — /dashboard,
 * /collection/*, /wishlist, /settings, all of it — because the slow await is in
 * the group's layout, not in any page: force-dynamic, currentViewer() and then
 * nineteen hundred cards out of getCollection(). 200 to 550 ms between the press
 * and the first pixel, in which nothing acknowledged the press at all.
 *
 * **It is not a skeleton, and that is the point.** A skeleton is a promise about
 * the layout that is about to arrive. One fallback stands in for seven screens
 * that share no layout — /dashboard has stat tiles and a chart, /settings has
 * five stacked sections and no cards at all, /collection has a toolbar and set
 * panels — so this file cannot make that promise. Two earlier attempts broke it
 * in the two available directions: the first drew the old /cards page and so was
 * wrong everywhere, the second drew only what all seven
 * genuinely share and so was a grey rail beside a grey slab, the shape of no
 * page in the app. The rule is still right;
 * a skeleton was the wrong thing to apply it to.
 *
 * So: the orb, centred, breathing. It says the app is coming and claims nothing
 * about what it will look like.
 *
 * If a route wants its own shape outlined, it gets its own loading.tsx. It does
 * not get added here.
 *
 * The real fix is still the one neither record did: stream the collection so the
 * shell renders for real and only the content pane waits. layout.tsx already has
 * `viewer` before the slow await, and the rail and the tab bar need nothing else
 * but three counts. Deferred, deliberately: the trigger is anyone touching
 * AppShell's props.
 */
export default function Loading() {
  return (
    // Not .page-cards: there are no panes to lay out here any more. What is kept
    // from it is the full-height box and the negative top margin that takes back
    // --main-pad-top — the room app/layout.tsx reserves for the tab bar. Without
    // that, min-h-dvh plus 32px of padding overflows and a scrollbar appears for
    // the length of the load and then leaves again.
    //
    // <main id="main-content"> on the outermost element, and not on an inner
    // pane as AppShell and the previous version of this file both do.
    // The rule there is that the landmark is the content pane rather than the
    // grid around the navigation — and this fallback draws no navigation at all,
    // so there is nothing for the landmark to wrongly contain. "Skip to content"
    // needs a target while the collection loads; this is the only element there
    // is to be one. app/main-landmark.test.ts is what would have caught its
    // absence.
    //
    // bg-secondary, not bg-primary: this is the page, and the page's tint is the
    // one app/layout.tsx paints on html and body. It is also what
    // pageCardsClassName paints, which is what arrives when the load finishes —
    // so the canvas does not change colour underneath the reader at the moment
    // the orb goes away. bg-primary is the raised, card colour.
    <main
      id="main-content"
      className="grid place-items-center bg-secondary min-h-screen min-h-dvh
        [margin:calc(-1*var(--main-pad-top))_auto_0]
        [@media(max-width:640px)]:[margin-top:0]"
    >
      {/* The same heading AppShell renders, word for word, so the document has
          exactly one h1 throughout the load rather than none until the page
          lands. .sr-only is position:absolute, so it does not take a grid cell
          and the orb stays centred on the window rather than under the heading. */}
      <h1 className="sr-only">{APP_NAME}</h1>

      {/* Two animations, on two elements, because they are two different
          statements. The wrapper fades the orb in 150ms late, so a load that
          finishes quickly shows plain background and never blinks a logo at
          anyone. The mark itself breathes on the same delay, so it starts its
          cycle at the moment it becomes visible instead of arriving mid-breath.

          The breathe is on the <picture> rather than the <img> because the img
          already carries Wordmark's measured nudge in its own transform. Both
          elements are blockified by their parent (a grid item, then this span is
          `block`), which a transform on an inline element would need. */}
      <span className="block opacity-0 [animation:orbArrive_200ms_var(--ease-out)_150ms_forwards]">
        <Mark
          px={64}
          className="block [animation:orbBreathe_2400ms_var(--ease-in-out)_150ms_infinite]"
        />
      </span>

      {/* One live region, and the bare word: this stands in for /settings as
          readily as for the collection, so "Loading the collection" would be
          wrong more often than it was right. */}
      <p className="sr-only" role="status">
        Loading
      </p>
    </main>
  );
}
