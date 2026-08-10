"use client";

import { LayoutGrid, Rows3 } from "lucide-react";
import { CARD_FIELDS, type CardField } from "./cards-fields";

export type ViewOptionsProps = {
  view: "grid" | "list";
  onView: (v: "grid" | "list") => void;
  /** How the same cards are arranged: as the sets, or against the Pokédex. */
  group: "set" | "flat" | "year" | "dex";
  onGroup: (g: "set" | "flat" | "year" | "dex") => void;
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
      <div className="sheet-field">
        <span className="sheet-label" id="view-group">
          Group by
        </span>
        <div className="cards-segmented" role="group" aria-labelledby="view-group">
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
              className={`cards-segment${group === key ? " is-active" : ""}`}
              aria-pressed={group === key}
              onClick={() => onGroup(key)}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      {/* Nothing to lay out or to size when the page is a dex: that shelf draws
          its own slots. */}
      {!dex && (
        <div className="sheet-field">
          <span className="sheet-label">Layout</span>
          <div className="cards-views" role="group" aria-label="Layout">
            {(
              [
                ["grid", LayoutGrid, "Grid"],
                ["list", Rows3, "List"],
              ] as const
            ).map(([key, Icon, text]) => (
              <button
                key={key}
                type="button"
                className={`cards-view${view === key ? " is-active" : ""}`}
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
          are seven of them. */}
      {!dex && (
        <div className="sheet-field">
          <span className="sheet-label">Show on card</span>
          <ul className="view-fields" role="list">
            {CARD_FIELDS.map(([key, text]) => (
              <li key={key}>
                <label className="view-field">
                  <input type="checkbox" checked={fields.has(key)} onChange={() => onField(key)} />
                  <span>{text}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!dex && view === "grid" && (
        <div className="sheet-field">
          <span className="sheet-label" id="view-size">
            Per row
          </span>
          <div className="cards-count-picker" role="group" aria-label="Cards per row">
            {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
              <button
                key={n}
                type="button"
                className={`cards-count-option${cols === n ? " is-active" : ""}`}
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
