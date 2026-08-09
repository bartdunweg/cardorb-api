"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Check, Plus } from "lucide-react";
import Modal from "./Modal";
import type { Facet } from "./FilterMenu";

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
 * also what makes clearing a facet safe here: on the dropdown, Clear takes
 * effect instantly and there is nothing to take it back with.
 *
 * Two levels, like the menu: the facets first, then the values inside one. On a
 * phone that matters more than it does in a dropdown, because "Pokémon" alone
 * is several hundred rows and a flat list of every facet's options would be a
 * sheet you scroll for a minute.
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

  const total = useMemo(
    () => facets.reduce((n, f) => n + f.selected.size, 0),
    [facets],
  );
  const staged = useMemo(
    () => Object.values(draft).reduce((n, s) => n + s.size, 0),
    [draft],
  );

  const toggle = (key: string, value: string) =>
    setDraft((d) => {
      const next = new Set(d[key] ?? []);
      if (!next.delete(value)) next.add(value);
      return { ...d, [key]: next };
    });

  const apply = () => {
    for (const f of facets) f.onReplace(new Set(draft[f.key] ?? []));
    setOpen(false);
  };

  const current = facets.find((f) => f.key === openFacet) ?? null;

  return (
    <>
      <button
        type="button"
        className="btn cards-filter-trigger"
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
        {total > 0 && <span className="cards-filter-badge">{total}</span>}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        label="Filter the collection"
        variant="right"
        className="modal--sheet"
      >
        <div className="sheet">
          <div className="sheet-head">
            {current ? (
              <button
                type="button"
                className="sheet-back"
                onClick={() => setOpenFacet(null)}
                aria-label="Back to all filters"
              >
                <ChevronLeft size={16} strokeWidth={2.5} aria-hidden="true" />
                <span>{current.label}</span>
              </button>
            ) : (
              <h2 className="sheet-title">Filter</h2>
            )}
            {/* Clears the draft, not the page. Nothing is undone until Apply,
                which is the whole point of staging: this is a big destructive
                button and here it costs nothing until you agree to it. */}
            {staged > 0 && (
              <button
                type="button"
                className="sheet-clear"
                onClick={() =>
                  current
                    ? setDraft((d) => ({ ...d, [current.key]: new Set() }))
                    : setDraft(Object.fromEntries(facets.map((f) => [f.key, new Set<string>()])))
                }
              >
                {current ? `Clear ${current.label.toLowerCase()}` : "Clear all"}
              </button>
            )}
          </div>

          <div className="sheet-body">
            {current ? (
              <ul className="sheet-list" role="list">
                {current.options.map((o) => (
                  <li key={o.value}>
                    <label className="sheet-option">
                      <input
                        type="checkbox"
                        checked={draft[current.key]?.has(o.value) ?? false}
                        onChange={() => toggle(current.key, o.value)}
                      />
                      <span className="sheet-option-name">
                        {current.display ? current.display(o.value) : o.value}
                      </span>
                      <span className="sheet-option-count">{o.count}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="sheet-list" role="list">
                {facets.map((f) => {
                  const on = draft[f.key]?.size ?? 0;
                  return (
                    <li key={f.key}>
                      <button
                        type="button"
                        className="sheet-facet"
                        onClick={() => setOpenFacet(f.key)}
                      >
                        <span className="sheet-option-name">{f.label}</span>
                        {on > 0 ? (
                          <span className="sheet-facet-on">
                            <Check size={13} strokeWidth={3} aria-hidden="true" />
                            {on}
                          </span>
                        ) : (
                          <span className="sheet-option-count">{f.options.length}</span>
                        )}
                        <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Under the thumb, and both halves of the decision side by side:
              a sheet whose only way out is Apply is a sheet that makes you
              undo what you were only looking at. */}
          <div className="sheet-foot">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn--primary sheet-apply" onClick={apply}>
              {staged > 0 ? `Apply ${staged}` : "Apply"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
