"use client";

import { useEffect, useRef } from "react";
import { Settings2 } from "lucide-react";
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
 * details/summary, like FilterMenu, and for its reasons: it opens on click and
 * on Enter, closes on Escape and sits in the tab order without a line of
 * keyboard handling. Closing on an outside click is the one thing it does not
 * do for itself, and the only handler here.
 *
 * No Apply and no Done: everything applies as you touch it, because the page is
 * right there behind the panel. That is the whole reason a dropdown is the
 * right shape at this width and a sheet is not.
 */
export default function ViewMenu(props: ViewOptionsProps) {
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
        <ViewOptions {...props} />
      </div>
    </details>
  );
}
