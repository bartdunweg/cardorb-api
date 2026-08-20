"use client";

import { Settings2 } from "lucide-react";
import { MenuDetails } from "./MenuDetails";
import ViewOptions, { type ViewOptionsProps } from "./ViewOptions";

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
    <MenuDetails
      trigger={
        <>
          <Settings2 size={15} strokeWidth={1.75} aria-hidden="true" />
          View
        </>
      }
      panelClassName="view-menu-panel flex flex-col gap-4 w-[260px] p-4
        [&_.cards-segmented]:w-full [&_.cards-views]:w-full [&_.cards-segment]:flex-1 [&_.cards-segment]:min-w-0 [&_.cards-segment]:px-2"
    >
      <ViewOptions {...props} />
    </MenuDetails>
  );
}
