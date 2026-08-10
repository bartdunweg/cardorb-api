"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import FilterOptions from "./FilterOptions";
import type { Facet } from "./cards-fields";

export type { Facet, Option } from "./cards-fields";


/**
 * One "Filter" button covering every facet, two levels deep: the facets first,
 * then the values inside whichever one you pick.
 *
 * It used to be six dropdowns sitting in the bar at all times, which is six
 * controls to scan before you know whether any of them is on, and a bar that
 * wrapped onto three rows on a laptop. A facet nobody is filtering by does not
 * need a permanent control; the active ones show up as chips underneath.
 *
 * details/summary rather than a custom popover: it opens on click and on Enter,
 * closes on Escape, and sits in the tab order without a line of keyboard
 * handling. Closing on an outside click is the one thing it does not do itself,
 * and the only handler here.
 */
export default function FilterMenu({ facets }: { facets: Facet[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [openFacet, setOpenFacet] = useState<string | null>(null);
  // Several hundred Pokémon between them, so nothing mounts until the menu has
  // been opened once.
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // pointerdown, not click. On click, React has already re-rendered and
    // unmounted the facet button by the time this runs, so contains() reports
    // the (now detached) target as outside and the menu shut itself the moment
    // you picked a facet. pointerdown fires while the button is still there.
    const onDocument = (e: PointerEvent) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false;
    };
    const onToggleOpen = () => {
      if (el.open) setOpened(true);
      // Back to the facet list next time, rather than reopening halfway into
      // whichever one happened to be used last.
      else setOpenFacet(null);
    };
    el.addEventListener("toggle", onToggleOpen);
    document.addEventListener("pointerdown", onDocument);
    return () => {
      el.removeEventListener("toggle", onToggleOpen);
      document.removeEventListener("pointerdown", onDocument);
    };
  }, []);

  const total = facets.reduce((n, f) => n + f.selected.size, 0);

  return (
    <details className="filter-menu" ref={ref}>
      <summary>
        <span>
          <Plus size={15} strokeWidth={1.75} aria-hidden="true" />
          Filter
          {total > 0 && <span className="filter-menu-badge">{total}</span>}
        </span>
      </summary>

      <div className="filter-menu-panel">
        {/* Nothing mounts until the menu has been opened once: several hundred
            Pokémon live behind one of these rows. */}
        {opened && (
          <FilterOptions
            facets={facets}
            openFacet={openFacet}
            onOpenFacet={setOpenFacet}
            // Live, all three of them. The page is visible beside this panel,
            // so a tick takes effect where you can watch it — which is the
            // whole reason a dropdown is right at this width and a sheet is
            // not. FilterSheet passes a draft to the same three.
            selected={(f) => f.selected}
            onToggle={(f, v) => f.onToggle(v)}
            onReplace={(f, next) => f.onReplace(next)}
          />
        )}
      </div>
    </details>
  );
}
