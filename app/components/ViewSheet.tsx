"use client";

import { useState } from "react";
import { LayoutGrid, Rows3, Settings2, Square } from "lucide-react";
import Modal from "./Modal";
import { CARD_FIELDS, type CardField } from "./CardsView";

/**
 * How the cards are drawn, behind one button, for a phone.
 *
 * It was two controls in the toolbar: a pair of icons for grid or list and a
 * slider for the size. On a laptop those sit in a row with room to spare; on a
 * phone they were most of a bar that already wraps, for two settings you change
 * once and then leave.
 *
 * Unlike the filters, this applies as you touch it. There is no Apply, and that
 * asymmetry is deliberate: a filter changes what is on the page, so staging it
 * behind a sheet you cannot see past is the honest thing to do, but the size of
 * a scan is a thing you judge by looking at it. Dragging a slider whose effect
 * arrives after you confirm is dragging in the dark. So the sheet is
 * translucent to the page in the only way that matters — you shut it and the
 * grid is already what you chose.
 */
export default function ViewSheet({
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
  /** How the same cards are arranged: as the sets, or against the Pokédex. */
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
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn cards-view-trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="View options"
      >
        <Settings2 size={16} strokeWidth={1.75} aria-hidden="true" />
        <span>View</span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        label="View options"
        variant="right"
        className="modal--sheet"
      >
        <div className="sheet">
          <div className="sheet-head">
            <h2 className="sheet-title">View</h2>
          </div>

          <div className="sheet-body sheet-body--pad">
            {/* First, because it is the bigger of the two choices: it decides
                what the page is a list of before anything decides how the rows
                are drawn. */}
            <div className="sheet-field">
              <span className="sheet-label" id="sheet-group">
                Group by
              </span>
              <div className="cards-segmented" role="group" aria-labelledby="sheet-group">
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

            {/* Only where there is a grid to size. In the list view every card
                is a row and the slider would move nothing. */}

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
                <span className="sheet-label" id="sheet-size">
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
                    aria-labelledby="sheet-size"
                    onChange={(e) => onSize(Number(e.target.value))}
                  />
                  <Square size={17} strokeWidth={2} aria-hidden="true" />
                </label>
              </div>
            )}
          </div>

          {/* Done, not Apply: it already is. This closes the sheet on the state
              it has been in the whole time it was open. */}
          <div className="sheet-foot">
            <button
              type="button"
              className="btn btn--primary sheet-apply"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
