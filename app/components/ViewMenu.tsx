"use client";

import { useEffect, useRef } from "react";
import { LayoutGrid, Rows3, Settings2, Square } from "lucide-react";
import { CARD_FIELDS, type CardField } from "./CardsView";

/**
 * The view options as a dropdown, for the widths that have room beside the
 * button to put one.
 *
 * ViewSheet's twin, and the same split Filter already runs: a panel where the
 * page is visible around it, a sheet where it is not. Both hold exactly the
 * same three controls, so there is one set of decisions and two ways to reach
 * them rather than two half-answers.
 *
 * details/summary, like FilterMenu, and for its reasons: it opens on click and
 * on Enter, closes on Escape and sits in the tab order without a line of
 * keyboard handling. Closing on an outside click is the one thing it does not
 * do for itself, and the only handler here.
 *
 * Everything applies as you touch it. There is no Apply and no Done: the page
 * is right there behind the panel, which is the whole reason a dropdown is the
 * right shape here and a sheet is not.
 */
export default function ViewMenu({
  view,
  onView,
  group,
  onGroup,
  fields,
  onField,
  size,
  onSize,
  min,
  max,
}: {
  view: "grid" | "list";
  onView: (v: "grid" | "list") => void;
  group: "set" | "flat" | "year" | "dex";
  onGroup: (g: "set" | "flat" | "year" | "dex") => void;
  /** Which optional facts a tile carries, and the toggle for one of them. */
  fields: ReadonlySet<CardField>;
  onField: (f: CardField) => void;
  size: number;
  onSize: (n: number) => void;
  min: number;
  max: number;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // pointerdown rather than click, for the reason FilterMenu gives: on click
    // React has already re-rendered and the target may be detached by the time
    // contains() is asked about it.
    const onDocument = (e: PointerEvent) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("pointerdown", onDocument);
    return () => document.removeEventListener("pointerdown", onDocument);
  }, []);

  return (
    <details className="filter-menu view-menu" ref={ref}>
      <summary>
        <span>
          <Settings2 size={15} strokeWidth={1.75} aria-hidden="true" />
          View
        </span>
      </summary>

      <div className="filter-menu-panel view-menu-panel">
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

        {/* Nothing to lay out or to size when the page is a dex: that shelf
            draws its own slots. */}
        {group !== "dex" && (
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
            these are independent answers, not one choice among several, and
            there are six of them. */}
        {group !== "dex" && (
          <div className="sheet-field">
            <span className="sheet-label">Show on card</span>
            <ul className="view-fields" role="list">
              {CARD_FIELDS.map(([key, text]) => (
                <li key={key}>
                  <label className="view-field">
                    <input
                      type="checkbox"
                      checked={fields.has(key)}
                      onChange={() => onField(key)}
                    />
                    <span>{text}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        {group !== "dex" && view === "grid" && (
          <div className="sheet-field">
            <span className="sheet-label" id="view-size">
              Card size
            </span>
            <label className="cards-size">
              <Square size={11} strokeWidth={2} aria-hidden="true" />
              <input
                type="range"
                min={min}
                max={max}
                step={4}
                value={size}
                aria-labelledby="view-size"
                onChange={(e) => onSize(Number(e.target.value))}
              />
              <Square size={17} strokeWidth={2} aria-hidden="true" />
            </label>
          </div>
        )}
      </div>
    </details>
  );
}
