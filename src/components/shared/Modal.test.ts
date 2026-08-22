import { describe, expect, it } from "vitest";
import { FOCUSABLE, isVisible } from "./Modal";

/**
 * The focus-trap predicate, tested on its own.
 *
 * Modal.tsx has said "see Modal.test.ts" since the trap was fixed and this file
 * did not exist. What it guards is not hypothetical: both halves of the
 * predicate were wrong at once and together they made every filter and view
 * sheet a keyboard trap below 1000px — which includes a desktop user at 200%
 * zoom, so it is a WCAG 2.1.2 failure and not only a phone one. Escape still
 * closed the sheet; nothing inside it could be reached.
 *
 * ── Why there is no rendering here ─────────────────────────────────────────
 *
 * This project runs vitest in node with no jsdom, deliberately — every other
 * test in the suite is a route handler, a pure function in lib/, or a static
 * scan over the source. Adding a DOM to test two predicates would be the tail
 * wagging the dog, so neither is tested through a browser:
 *
 *   - FOCUSABLE is a selector *string*. What broke was which elements it names,
 *     and that is a property of the string.
 *   - isVisible touches exactly two DOM APIs, `getClientRects()` and
 *     `getComputedStyle().visibility`. A stub with those two members exercises
 *     every branch it has.
 *
 * The rendered half is covered elsewhere: visual/landmark.ts walks ten real
 * pages at three widths in a real browser.
 */

describe("FOCUSABLE", () => {
  /**
   * Bug one: the selector was
   * `a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])` — no form
   * controls at all. In CardAddDialog and the card modals `first` and `last`
   * were computed over the wrong set, so the Tab wrap landed in the wrong place.
   */
  it.each(["input", "select", "textarea"])("names %s, which it once did not", (tag) => {
    expect(FOCUSABLE).toContain(`${tag}:not([disabled])`);
  });

  it("still names the three it always had", () => {
    expect(FOCUSABLE).toContain("a[href]");
    expect(FOCUSABLE).toContain("button:not([disabled])");
    expect(FOCUSABLE).toContain('[tabindex]:not([tabindex="-1"])');
  });

  it("excludes disabled controls rather than filtering them later", () => {
    // Every element type that can carry `disabled` has to say so in the
    // selector. One that does not puts a dead control in the tab order, and the
    // trap wraps onto something the browser will not focus.
    for (const tag of ["button", "input", "select", "textarea"]) {
      expect(FOCUSABLE).toContain(`${tag}:not([disabled])`);
    }
  });

  it("is a selector a DOM would accept", () => {
    // Guards the guard: a typo here fails silently at runtime, because
    // querySelectorAll throws and the catch-free call site takes the whole
    // dialog down rather than mis-focusing one element.
    // A tag, an attribute, or a tag with an attribute — then an optional
    // :not(). `[tabindex]` is the one with no tag, which is the whole reason
    // the tag cannot simply be required.
    for (const part of FOCUSABLE.split(",")) {
      expect(part.trim()).toMatch(
        /^(?:[a-z]+|\[[^\]]+\]|[a-z]+\[[^\]]+\])(?::not\([^)]+\))?$/,
      );
    }
  });
});

/** The two members isVisible actually reads, and nothing else. */
const el = (rects: number, visibility = "visible", withView = true) =>
  ({
    getClientRects: () => ({ length: rects }),
    ownerDocument: {
      defaultView: withView ? { getComputedStyle: () => ({ visibility }) } : null,
    },
  }) as unknown as HTMLElement;

describe("isVisible", () => {
  /**
   * Bug two: querySelectorAll filters on the `disabled` *attribute*, not on
   * whether an element is rendered. Sheet hides the modal's close button with a
   * Tailwind `hidden` class — display: none — so the selector still returned it,
   * focusables()[0].focus() targeted it, and focusing a display:none element
   * does nothing. Focus never moved again.
   */
  it("rejects an element with no rects, which is what display:none looks like", () => {
    expect(isVisible(el(0))).toBe(false);
  });

  it("accepts an element with rects", () => {
    expect(isVisible(el(1))).toBe(true);
  });

  it("rejects visibility:hidden, which still has rects", () => {
    // Checked separately from the rects for exactly this reason: a
    // visibility:hidden element is laid out and unfocusable at the same time.
    expect(isVisible(el(1, "hidden"))).toBe(false);
  });

  it("accepts visibility:collapse and anything else that is not hidden", () => {
    // The check is `!== "hidden"`, not `=== "visible"`. Inheriting elements
    // report their computed value, and treating every non-visible value as
    // unfocusable would drop real controls out of the trap.
    expect(isVisible(el(1, "collapse"))).toBe(true);
  });

  it("rejects an element in a document with no window", () => {
    // A detached document has no defaultView. The optional chain returns
    // undefined, which is not "hidden", so the naive reading is that this
    // passes — it does, and that is the intended answer: rects were found, so
    // something laid this element out.
    expect(isVisible(el(1, "visible", false))).toBe(true);
    // But with no rects the first check has already refused it, window or not.
    expect(isVisible(el(0, "visible", false))).toBe(false);
  });
});
