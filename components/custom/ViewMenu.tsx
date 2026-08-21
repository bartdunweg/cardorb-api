"use client";

import { Settings2 } from "lucide-react";
import { MenuPopover } from "@/components/custom/MenuPopover";
import ViewOptions, { type ViewOptionsProps } from "@/components/custom/ViewOptions";

/**
 * The view options as a dropdown, for the widths that have room beside the
 * button to put one.
 *
 * ViewSheet's twin, and the same split Filter runs: a panel where the page is
 * visible around it, a sheet where it is not. The controls themselves live in
 * ViewOptions, which is what the two have in common; this file is the wrapper
 * and nothing else.
 *
 * No Apply and no Done: everything applies as you touch it, because the page is
 * right there behind the panel. That is the whole reason a dropdown is the
 * right shape at this width and a sheet is not.
 */
export default function ViewMenu(props: ViewOptionsProps) {
  return (
    <MenuPopover
      label="View options"
      trigger={
        <>
          <Settings2 size={15} strokeWidth={1.75} aria-hidden="true" />
          View
        </>
      }
      /* The four `[&_.cards-*]` width hooks that used to hang off this string
         are gone with the class names they reached: ViewOptions' two word
         tracks now ask for the full row themselves (Segmented's `full`), and
         the Layout toggle deliberately does not — two icon buttons stretched
         across 260px was the old rule doing it by accident. */
      /* 300, not 260. Measured on the built page: at 260 the "Group by" row
         gives each of its four segments 57px and "Pokédex" needs 58, and
         "Cheapest" needs 65 in 62 — both clipped. Untitled UI's segment carries
         more padding than the pill track it replaced, so the row that used to
         fit no longer does. 300 leaves 67px a segment and both fit with room. */
      panelClassName="view-menu-panel flex flex-col gap-4 w-[300px] max-w-[min(300px,calc(100vw-2*var(--page-pad-x)))] p-4"
    >
      <ViewOptions {...props} />
    </MenuPopover>
  );
}
