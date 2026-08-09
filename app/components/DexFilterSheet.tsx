"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import Modal from "./Modal";
import type { DexOwned } from "./CardsView";

/**
 * The Pokédex's two controls, as a sheet, for a phone.
 *
 * The same problem the collection's toolbar had and the same answer: a
 * segmented control of three eras plus a four-option dropdown, side by side
 * with a search field, is a bar that wraps onto two rows for settings you touch
 * once. One button, and both of them behind it.
 *
 * Staged, like FilterSheet, for the reason that one gives: the sheet covers the
 * shelf it is filtering, so applying as you tap changes something you cannot
 * see. Two single-choice controls is a thin thing to stage, but a Filter button
 * that behaves one way here and another way one screen over is worse than
 * either behaviour on its own.
 */
export default function DexFilterSheet({
  era,
  onEra,
  owned,
  onOwned,
  ownedOptions,
}: {
  era: "all" | "vintage" | "modern";
  onEra: (v: "all" | "vintage" | "modern") => void;
  owned: DexOwned;
  onOwned: (v: DexOwned) => void;
  ownedOptions: readonly (readonly [DexOwned, string])[];
}) {
  const [open, setOpen] = useState(false);
  const [draftEra, setDraftEra] = useState(era);
  const [draftOwned, setDraftOwned] = useState(owned);

  // Anything other than the two defaults counts, so the badge says "this shelf
  // is not the whole dex" rather than counting controls that have been touched.
  const active = (era !== "all" ? 1 : 0) + (owned !== "all" ? 1 : 0);

  const apply = () => {
    onEra(draftEra);
    onOwned(draftOwned);
    setOpen(false);
  };

  const ERAS = [
    ["all", "All"],
    ["vintage", "Vintage"],
    ["modern", "Modern"],
  ] as const;

  return (
    <>
      <button
        type="button"
        className="btn cards-filter-trigger"
        onClick={() => {
          setDraftEra(era);
          setDraftOwned(owned);
          setOpen(true);
        }}
        aria-haspopup="dialog"
      >
        <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
        <span>Filter</span>
        {active > 0 && <span className="cards-filter-badge">{active}</span>}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        label="Filter the Pokédex"
        variant="right"
        className="modal--sheet"
      >
        <div className="sheet">
          <div className="sheet-head">
            <h2 className="sheet-title">Filter</h2>
          </div>

          <div className="sheet-body sheet-body--pad">
            <div className="sheet-field">
              <span className="sheet-label" id="dex-era">
                Era
              </span>
              <div className="cards-segmented" role="group" aria-labelledby="dex-era">
                {ERAS.map(([value, text]) => (
                  <button
                    key={value}
                    type="button"
                    className={`cards-segment${draftEra === value ? " is-active" : ""}`}
                    aria-pressed={draftEra === value}
                    onClick={() => setDraftEra(value)}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>

            {/* A list of rows rather than the toolbar's dropdown: a native
                select on a phone opens a picker of its own, which is a second
                sheet over this one for four words that fit here. */}
            <div className="sheet-field">
              <span className="sheet-label">Owned</span>
              <ul className="sheet-list" role="list">
                {ownedOptions.map(([value, text]) => (
                  <li key={value}>
                    <label className="sheet-option">
                      <input
                        type="radio"
                        name="dex-owned"
                        checked={draftOwned === value}
                        onChange={() => setDraftOwned(value)}
                      />
                      <span className="sheet-option-name">{text}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="sheet-foot">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn--primary sheet-apply" onClick={apply}>
              Apply
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
