"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { MenuDetails, filterMenuBadgeClassName } from "./MenuDetails";
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
 */
export default function FilterMenu({ facets }: { facets: Facet[] }) {
  const [openFacet, setOpenFacet] = useState<string | null>(null);
  // Several hundred Pokémon between them, so nothing mounts until the menu has
  // been opened once.
  const [opened, setOpened] = useState(false);

  const total = facets.reduce((n, f) => n + f.selected.size, 0);

  return (
    <MenuDetails
      trigger={
        <>
          <Plus size={15} strokeWidth={1.75} aria-hidden="true" />
          Filter
        </>
      }
      badge={total > 0 && <span className={filterMenuBadgeClassName}>{total}</span>}
      onToggle={(open) => {
        if (open) setOpened(true);
        // Back to the facet list next time, rather than reopening halfway
        // into whichever one happened to be used last.
        else setOpenFacet(null);
      }}
    >
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
    </MenuDetails>
  );
}
