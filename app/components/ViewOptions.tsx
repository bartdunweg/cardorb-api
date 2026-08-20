"use client";

import { LayoutGrid, Rows3 } from "lucide-react";
import { CARD_FIELDS, type CardField } from "./cards-fields";
import {
  cardsSegmentClassName,
  cardsSegmentedClassName,
  cardsViewClassName,
  cardsViewsClassName,
} from "./trackClasses";

const fieldClassName = "flex flex-col gap-2";
const labelClassName = "[font-size:var(--fs-small)] text-secondary";

export type ViewOptionsProps = {
  view: "grid" | "list";
  onView: (v: "grid" | "list") => void;
  /** How the same cards are arranged: as the sets, or against the Pokédex. */
  group: "set" | "flat" | "year" | "dex";
  onGroup: (g: "set" | "flat" | "year" | "dex") => void;
  /** How cards are ordered within their set. Hidden where there's no price to order by. */
  sort: "set" | "value" | "value-asc";
  onSort: (s: "set" | "value" | "value-asc") => void;
  showSort: boolean;
  /** Which optional facts a tile carries, and the toggle for one of them. */
  fields: ReadonlySet<CardField>;
  onField: (f: CardField) => void;
  /** How many cards across, and the range this screen allows. */
  cols: number;
  onCols: (n: number) => void;
  min: number;
  max: number;
};

/**
 * The view controls themselves, without deciding what they open inside.
 *
 * There were two copies of this: ViewMenu drew them in a dropdown and ViewSheet
 * drew them in a sheet, and 93 of their ~120 lines were the same lines. Both are
 * always mounted — the stylesheet decides which one you can see — so the app was
 * carrying four copies of these controls at every moment, two of them with
 * state of their own.
 *
 * Two copies is also how they stopped agreeing. ViewMenu hid the Layout toggle
 * when the page is grouped as a Pokédex, because a dex draws its own slots and
 * grid-or-list moves nothing; ViewSheet showed it anyway. That is fixed here by
 * there being one answer to hide.
 *
 * What stays outside: the wrapper, and whether there is a button at the bottom.
 * The dropdown has none because the page is visible behind it and every control
 * applies as you touch it; the sheet has Done, because it covers the page and
 * needs a way out. That difference is real, which is why the two files still
 * exist.
 */
export default function ViewOptions({
  view,
  onView,
  group,
  onGroup,
  sort,
  onSort,
  showSort,
  fields,
  onField,
  cols,
  onCols,
  min,
  max,
}: ViewOptionsProps) {
  const dex = group === "dex";

  return (
    <>
      {/* First, because it is the bigger of the two choices: it decides what
          the page is a list of before anything decides how the rows are
          drawn. */}
      <div className={fieldClassName}>
        <span className={labelClassName} id="view-group">
          Group by
        </span>
        <div className={cardsSegmentedClassName} role="group" aria-labelledby="view-group">
          {(
            [
              ["flat", "None"],
              ["set", "Set"],
              ["year", "Year"],
              ["dex", "Pokédex"],
            ] as const
          ).map(([key, text]) => (
            <button
              key={key}
              type="button"
              className={cardsSegmentClassName(group === key)}
              aria-pressed={group === key}
              onClick={() => onGroup(key)}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      {/* How cards are ordered within their set. Two of the three orders are
          by price, and on the public link there are no prices to order by:
          that leaves one option, and a control with one option is
          furniture. */}
      {showSort && (
        <div className={fieldClassName}>
          <span className={labelClassName} id="view-sort">
            Sort
          </span>
          <div className={cardsSegmentedClassName} role="group" aria-labelledby="view-sort">
            {(
              [
                ["set", "By set"],
                ["value", "Priciest"],
                ["value-asc", "Cheapest"],
              ] as const
            ).map(([key, text]) => (
              <button
                key={key}
                type="button"
                className={cardsSegmentClassName(sort === key)}
                aria-pressed={sort === key}
                onClick={() => onSort(key)}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Nothing to lay out or to size when the page is a dex: that shelf draws
          its own slots. */}
      {!dex && (
        <div className={fieldClassName}>
          <span className={labelClassName}>Layout</span>
          <div className={cardsViewsClassName} role="group" aria-label="Layout">
            {(
              [
                ["grid", LayoutGrid, "Grid"],
                ["list", Rows3, "List"],
              ] as const
            ).map(([key, Icon, text]) => (
              <button
                key={key}
                type="button"
                className={cardsViewClassName(view === key)}
                aria-pressed={view === key}
                aria-label={`${text} view`}
                onClick={() => onView(key)}
              >
                <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Which facts a tile carries. Checkboxes rather than a segmented row:
          these are independent answers, not one choice among several, and there
          are seven of them. Two columns, because six checkboxes in one run is a
          panel twice as tall as the controls above it for the least important
          of the three questions it asks. */}
      {!dex && (
        <div className={fieldClassName}>
          <span className={labelClassName}>Show on card</span>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 m-0 p-0 list-none" role="list">
            {CARD_FIELDS.map(([key, text]) => (
              <li key={key}>
                <label
                  className="flex items-center gap-2 min-h-7 [font-family:var(--font-body)]
                    [font-size:var(--fs-small)] text-primary cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={fields.has(key)}
                    onChange={() => onField(key)}
                    /* Explicit, where this used to inherit `.filter-menu-panel
                       input` from cards.css. That rule is gone with the filter
                       rows it was written for, and a bare checkbox here would
                       have quietly gone back to the browser's own grey — which
                       is the exact failure that rule's comment describes. */
                    className="size-4 shrink-0 appearance-none rounded m-0 cursor-pointer bg-primary ring-1 ring-primary ring-inset transition duration-100 ease-linear checked:bg-brand-solid checked:ring-brand checked:after:mx-auto checked:after:mt-px checked:after:block checked:after:h-2 checked:after:w-1 checked:after:rotate-45 checked:after:border-white checked:after:[border-width:0_2px_2px_0] checked:after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  />
                  <span>{text}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* How many cards across. A row of numbers rather than a slider: the
          answer is a small whole number and there are never more than eight of
          them, so picking one directly beats dragging until the grid happens to
          land on it. */}
      {!dex && view === "grid" && (
        <div className={fieldClassName}>
          <span className={labelClassName} id="view-size">
            Per row
          </span>
          <div className="flex gap-1 w-full" role="group" aria-label="Cards per row">
            {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
              <button
                key={n}
                type="button"
                className={`flex-1 min-w-0 h-8 rounded-orb-sm [font-family:var(--font-body)] [font-size:var(--fs-small)]
                  tabular-nums cursor-pointer ${
                    cols === n
                      ? "border-transparent bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
                      : "border border-[var(--color-border)] bg-transparent text-secondary"
                  }`}
                aria-pressed={cols === n}
                onClick={() => onCols(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
