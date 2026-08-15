"use client";

import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import type { Facet } from "./cards-fields";
import { cardsSegmentClassName, cardsSegmentedClassName } from "./trackClasses";

/**
 * How many answers a facet may have before it goes behind a row of its own.
 * Era is the reason: it is Vintage and Modern and nothing else, and going a
 * level in to tick one of two boxes is a press to reach a press.
 */
export const INLINE_MAX = 3;

/**
 * The facets, drawn once, for both things that show them.
 *
 * FilterMenu and FilterSheet were two files describing the same two-level
 * list — the facets, then the values inside one — under two vocabularies:
 * `.filter-menu-name` here, `.sheet-option-name` there. Both are always
 * mounted, with the stylesheet choosing which is visible, so every row existed
 * twice and drifted once: the dropdown grew inline segments for the short
 * facets and the sheet never did.
 *
 * One markup, one set of class names, styled by whichever wrapper it lands in.
 * `.filter-menu-panel .facet-row` is a compact dropdown row; `.sheet .facet-row`
 * is a 48px target for a thumb. That difference is real and stays in CSS, which
 * is where it belongs.
 *
 * What does *not* move in here is staging. The dropdown applies a tick the
 * moment it is made, because the page is visible beside it; the sheet holds
 * every tick in a draft until Apply, because it covers the page and there is
 * nothing to watch change. So this component never touches a facet's own
 * handlers — it asks the caller what is selected and tells the caller what was
 * pressed, and the caller decides whether that means "now" or "on Apply".
 */
export type FilterOptionsProps = {
  facets: Facet[];
  /** Which facet is drilled into, or null for the list of facets. */
  openFacet: string | null;
  onOpenFacet: (key: string | null) => void;
  /** What counts as selected — the live set, or a draft of it. */
  selected: (facet: Facet) => ReadonlySet<string>;
  onToggle: (facet: Facet, value: string) => void;
  onReplace: (facet: Facet, next: Set<string>) => void;
};

export default function FilterOptions({
  facets,
  openFacet,
  onOpenFacet,
  selected,
  onToggle,
  onReplace,
}: FilterOptionsProps) {
  const current = facets.find((f) => f.key === openFacet) ?? null;

  if (current) {
    const on = selected(current);
    return (
      <>
        {/* One row, always the same height, with Clear in it rather than under
            it. It used to appear as its own line the moment a box was ticked,
            which pushed the list down by its height under the pointer that had
            just ticked it — so the next option you meant to click had moved. */}
        <div className="facet-head">
          <button
            type="button"
            className="facet-back"
            onClick={() => onOpenFacet(null)}
            aria-label="Back to all filters"
          >
            <ChevronLeft size={14} strokeWidth={1.75} aria-hidden="true" />
            {current.label}
          </button>
          {on.size > 0 && (
            <button
              type="button"
              className="facet-clear"
              onClick={() => onReplace(current, new Set())}
            >
              Clear
            </button>
          )}
        </div>
        <ul className="facet-list" role="list">
          {current.options.map((o) => (
            <li key={o.value}>
              <label className="facet-option">
                <input
                  type="checkbox"
                  checked={on.has(o.value)}
                  onChange={() => onToggle(current, o.value)}
                />
                <span className="facet-name">
                  {current.display ? current.display(o.value) : o.value}
                </span>
                <span className="facet-count">{o.count}</span>
              </label>
            </li>
          ))}
        </ul>
      </>
    );
  }

  const inline = facets.filter((f) => f.options.length > 0 && f.options.length <= INLINE_MAX);
  const drilled = facets.filter((f) => f.options.length > INLINE_MAX);

  return (
    <>
      {inline.map((f) => {
        const on = selected(f);
        return (
          <div key={f.key} className="facet-inline">
            <span className="facet-inline-label">{f.label}</span>
            <div className={cardsSegmentedClassName} role="group" aria-label={f.label}>
              {/* Ticking nothing is an answer, and on a facet of two it is the
                  commonest one — so it gets a word rather than being the state
                  you reach by unticking whatever is on. */}
              <button
                type="button"
                className={cardsSegmentClassName(on.size === 0)}
                aria-pressed={on.size === 0}
                onClick={() => onReplace(f, new Set())}
              >
                All
              </button>
              {f.options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={cardsSegmentClassName(on.has(o.value))}
                  aria-pressed={on.has(o.value)}
                  onClick={() => onToggle(f, o.value)}
                >
                  {f.display ? f.display(o.value) : o.value}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <ul className="facet-list" role="list">
        {drilled.map((f) => {
          const on = selected(f);
          return (
            <li key={f.key}>
              <button type="button" className="facet-row" onClick={() => onOpenFacet(f.key)}>
                <span className="facet-name">{f.label}</span>
                {/* Both are a bare number on screen and the difference between
                    them is a tick you cannot hear. "Type, 3" could be three
                    selected or three to choose from, so the row says which. */}
                {on.size > 0 ? (
                  <span className="facet-on">
                    <Check size={13} strokeWidth={1.75} aria-hidden="true" />
                    <span aria-hidden="true">{on.size}</span>
                    <span className="sr-only">{on.size} selected</span>
                  </span>
                ) : (
                  <span className="facet-count">
                    <span aria-hidden="true">{f.options.length}</span>
                    <span className="sr-only">{f.options.length} options</span>
                  </span>
                )}
                <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
