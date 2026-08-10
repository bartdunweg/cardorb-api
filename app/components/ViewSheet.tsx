"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import Modal from "./Modal";
import ViewOptions, { type ViewOptionsProps } from "./ViewOptions";

/**
 * The same view options as a sheet, for a phone.
 *
 * On a laptop the toggles and the picker sit in a row with room to spare; on a
 * phone they were most of a bar that already wraps, for settings you change
 * once and then leave. So one button, and everything behind it.
 *
 * Unlike the filters, this applies as you touch it. There is no Apply, and that
 * asymmetry is deliberate: a filter changes what is on the page, so staging it
 * behind a sheet you cannot see past is the honest thing to do, but how big a
 * scan is drawn is a thing you judge by looking at it. The button at the bottom
 * says Done rather than Apply because it is a door, not a decision.
 *
 * The controls are ViewOptions, shared with ViewMenu. Both are always mounted
 * and the stylesheet decides which is visible, so anything that lived in both
 * files existed four times over — and had already drifted: the dropdown hid the
 * Layout toggle in Pokédex mode and this one did not.
 */
export default function ViewSheet(props: ViewOptionsProps) {
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
            <ViewOptions {...props} />
          </div>

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
