"use client";

import { useState } from "react";
import { Sliders02 } from "@untitledui-pro/icons/line";
import { Button as UntitledButton } from "@/components/base/buttons/button";
import Button from "@/components/shared/Button";
import { Sheet, sheetApplyButtonClassName } from "@/components/shared/Sheet";
import ViewOptions, { type ViewOptionsProps } from "@/features/collection/components/ViewOptions";

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
      {/* Untitled UI's Button rather than this app's wrapper: the wrapper has no
          slot for `aria-haspopup`. `size="md"` is what the class recipe
          defaulted to; the component itself defaults to `sm`. */}
      <UntitledButton
        size="md"
        color="secondary"
        className="cards-view-trigger"
        onPress={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="View options"
        iconLeading={<Sliders02 size={16} strokeWidth={1.75} aria-hidden="true" />}
      >
        View
      </UntitledButton>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        label="View options"
        title="View"
        padBody
        footer={
          <Button
            color="primary"
            className={sheetApplyButtonClassName}
            onClick={() => setOpen(false)}
          >
            Done
          </Button>
        }
      >
        <ViewOptions {...props} />
      </Sheet>
    </>
  );
}
