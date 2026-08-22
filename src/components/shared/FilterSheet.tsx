"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus } from "@untitledui-pro/icons/line";
import {
  Sheet,
  sheetApplyButtonClassName,
  sheetClearButtonClassName,
  sheetFootButtonClassName,
} from "@/components/shared/Sheet";
import { Badge } from "@/components/base/badges/badges";
import { Button as UntitledButton } from "@/components/base/buttons/button";
import Button from "@/components/shared/Button";
import FilterOptions from "@/components/shared/FilterOptions";
import type { Facet } from "@/components/shared/cards-fields";

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
      {/* Untitled UI's Button rather than this app's wrapper, for two reasons
          the wrapper cannot express: `aria-haspopup`, and a trailing slot that
          takes an arbitrary node. `size="md"` is not a choice — it is what the
          class recipe defaulted to, where the component defaults to `sm`. */}
      <UntitledButton
        size="md"
        color="secondary"
        // Seeded here rather than in an effect on `open`. Same result, one
        // render fewer, and it says plainly that a fresh draft is part of what
        // opening means: a sheet that remembered what you nearly did last time
        // would apply it the next time you pressed Apply.
        onPress={() => {
          setDraft(seed());
          setOpenFacet(null);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        iconLeading={<Plus size={15} strokeWidth={2.5} aria-hidden="true" />}
        // The count goes in the trailing icon slot rather than among the
        // children: children are wrapped in the component's own `data-text`
        // span, and a badge is not text.
        //
        // `.cards-filter-badge` and `.cards-filter-trigger` were both classes
        // with no definition left anywhere — they went with cards.css and the
        // names stayed in the JSX, so this count has been rendering as bare
        // text beside the label. It is Untitled UI's Badge now; the trigger's
        // class was dead outright and is gone.
        iconTrailing={
          total > 0 ? (
            <Badge type="pill-color" color="brand" size="sm">
              {total}
            </Badge>
          ) : undefined
        }
      >
        Filter
      </UntitledButton>

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
            <Button color="secondary" className={sheetFootButtonClassName} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button color="primary" className={sheetApplyButtonClassName} onClick={apply}>
              {staged > 0 ? `Apply ${staged}` : "Apply"}
            </Button>
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
