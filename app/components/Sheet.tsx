"use client";

import type { ReactNode } from "react";
import Modal from "./Modal";

/**
 * The bottom-of-a-phone-screen dialog FilterSheet and ViewSheet both draw.
 *
 * Extracted rather than left as two copies of the same chrome: the head, the
 * scrolling body, and the foot were the same 30-odd lines in both files, and
 * FilterSheet was the one place that needed a header button (Clear all)
 * ViewSheet does not — a `headExtra` slot rather than a second component.
 */
export function Sheet({
  open,
  onClose,
  label,
  title,
  headExtra,
  footer,
  padBody = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  title: string;
  headExtra?: ReactNode;
  footer: ReactNode;
  /** ViewSheet's body is a column of fields with its own padding; FilterSheet's
   * is FilterOptions' own rows, already padded for a 48px thumb target. */
  padBody?: boolean;
  children: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      label={label}
      variant="right"
      // modal--sheet stays a literal class: .modal--sheet .modal-scroll and
      // .modal-close live in cards.css against Modal.tsx's own internal
      // markup, which this component can't reach with a className prop.
      //
      // bg-[var(--color-bg-surface)], not --glass-bg-solid: that token is
      // solid only by name (0.9 alpha in light, 0.66 in dark), so a sheet
      // wearing it read as the same frosted layer as the blur behind it, and
      // every row was a word over whatever card art happened to be there. A
      // list you read needs a real surface.
      className="modal--sheet w-full max-w-none rounded-t-lg rounded-b-none border-b-0
        bg-[var(--color-bg-surface)]"
    >
      <div className="sheet flex flex-col max-h-[88svh]">
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 border-b border-[var(--color-border)]">
          <h2 className="m-0 [font-family:var(--font-main)] [font-weight:var(--fw-title)] [font-size:var(--fs-sub)] text-label">
            {title}
          </h2>
          {headExtra}
        </div>

        {/* The one part that scrolls. Several hundred Pokémon in one facet,
            and the head and the foot have to stay where a thumb left them.
            `sheet` and `sheet-body` stay as literal classes: FilterOptions.tsx
            styles its own rows differently depending on which ancestor they
            land in (see FilterOptions.tsx's own comment on that). */}
        <div
          className={`sheet-body flex-1 min-h-0 overflow-y-auto [overscroll-behavior:contain]
            [-webkit-overflow-scrolling:touch] ${padBody ? "p-4 flex flex-col gap-5" : ""}`}
        >
          {children}
        </div>

        {/* Below the scroller, so it is reachable without scrolling to the
            end of six hundred Pokémon first, and clear of the home
            indicator. */}
        <div
          className="flex gap-2 border-t border-[var(--color-border)]
            [padding:var(--space-3)_var(--space-4)_calc(var(--space-4)+env(safe-area-inset-bottom,0px))]"
        >
          {footer}
        </div>
      </div>
    </Modal>
  );
}

export const sheetClearButtonClassName =
  "p-0 border-none bg-transparent [font-family:var(--font-body)] [font-size:var(--fs-small)] text-label-tertiary cursor-pointer";

export const sheetFootButtonClassName = "flex-1 justify-center self-auto";
export const sheetApplyButtonClassName = "flex-[2_1_0%] justify-center self-auto";
