"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus } from "@untitledui-pro/icons/line";
import {
  Sheet,
  sheetApplyButtonClassName,
  sheetClearButtonClassName,
  sheetFootButtonClassName,
} from "@/components/custom/Sheet";
import { Badge } from "@/components/base/badges/badges";
import FilterOptions from "@/components/custom/FilterOptions";
import type { Facet } from "@/components/custom/cards-fields";
import { untitledButton } from "@/components/custom/untitledButtonClasses";

/**
 * The same facets as FilterMenu, as a sheet, for a phone.
 *
 * FilterMenu is a dropdown: it opens beside its button with the page still
 * visible around it, so a tick can take effect the moment it is made and you
 * watch the grid answer. A sheet covers the page. Ticking there and applying as
 * you go means changing something you cannot see, and closing the sheet to a
 * result you did not watch arrive.
 *
 * So this one stages. Every tick goes into a draft, the page behind does not
 * move, and Apply is what commits — or Cancel, which drops the lot. That is
 * also what makes Clear safe here: on the dropdown it takes effect instantly
 * and there is nothing to take it back with.
 *
 * The rows are FilterOptions, shared with the dropdown. Staging is what stays
 * here, because it is the one thing the two genuinely disagree about: this file
 * hands that component a draft where the dropdown hands it the live selection,
 * and the component itself never learns which it is looking at.
 */
export default function FilterSheet({ facets }: { facets: Facet[] }) {
  const [open, setOpen] = useState(false);
  const [openFacet, setOpenFacet] = useState<string | null>(null);
  /** The staged selection, per facet key. Seeded from the live one on open. */
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});

  const seed = useCallback(
    () => Object.fromEntries(facets.map((f) => [f.key, new Set(f.selected)])),
    [facets],
  );

  const total = useMemo(() => facets.reduce((n, f) => n + f.selected.size, 0), [facets]);
  const staged = useMemo(() => Object.values(draft).reduce((n, s) => n + s.size, 0), [draft]);

  const apply = () => {
    for (const f of facets) f.onReplace(new Set(draft[f.key] ?? []));
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={untitledButton({ color: "secondary" })}
        // Seeded here rather than in an effect on `open`. Same result, one
        // render fewer, and it says plainly that a fresh draft is part of what
        // opening means: a sheet that remembered what you nearly did last time
        // would apply it the next time you pressed Apply.
        onClick={() => {
          setDraft(seed());
          setOpenFacet(null);
          setOpen(true);
        }}
        aria-haspopup="dialog"
      >
        <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
        <span>Filter</span>
        {/* `.cards-filter-badge` and `.cards-filter-trigger` were both classes
            with no definition left anywhere — they went with cards.css and the
            names stayed in the JSX, so this count has been rendering as bare
            text beside the label. It is Untitled UI's Badge now; the trigger's
            class was dead outright and is gone. */}
        {total > 0 && (
          <Badge type="pill-color" color="brand" size="sm">
            {total}
          </Badge>
        )}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        label="Filter the collection"
        title="Filter"
        headExtra={
          // Clears the draft, not the page. Nothing is undone until Apply,
          // which is the whole point of staging: this is a big destructive
          // button and here it costs nothing until you agree to it.
          staged > 0 && (
            <button
              type="button"
              className={sheetClearButtonClassName}
              onClick={() => setDraft(Object.fromEntries(facets.map((f) => [f.key, new Set()])))}
            >
              Clear all
            </button>
          )
        }
        footer={
          // Under the thumb, and both halves of the decision side by side: a
          // sheet whose only way out is Apply is a sheet that makes you undo
          // what you were only looking at.
          <>
            <button
              type="button"
              className={untitledButton({
                color: "secondary",
                className: sheetFootButtonClassName,
              })}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={untitledButton({ color: "primary", className: sheetApplyButtonClassName })}
              onClick={apply}
            >
              {staged > 0 ? `Apply ${staged}` : "Apply"}
            </button>
          </>
        }
      >
        <FilterOptions
          variant="sheet"
          facets={facets}
          openFacet={openFacet}
          onOpenFacet={setOpenFacet}
          // The draft, not the facet. This is the whole difference between
          // the two wrappers, and it is three lines.
          selected={(f) => draft[f.key] ?? new Set()}
          onToggle={(f, value) =>
            setDraft((d) => {
              const next = new Set(d[f.key] ?? []);
              if (!next.delete(value)) next.add(value);
              return { ...d, [f.key]: next };
            })
          }
          onReplace={(f, next) => setDraft((d) => ({ ...d, [f.key]: next }))}
        />
      </Sheet>
    </>
  );
}
