"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Check } from "lucide-react";

export type Option = { value: string; count: number };

/** Up to this many answers, a facet is shown open rather than behind a row. */
const INLINE_MAX = 3;

export type Facet = {
  key: string;
  label: string;
  options: Option[];
  /** Read-only here: the menu only ever asks it what is on. A mutable Set is
      still accepted, this just does not claim the right to change one. */
  selected: ReadonlySet<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
  /**
   * The whole selection at once, for a control that stages its changes instead
   * of applying them as they are made. FilterMenu never calls this — it applies
   * a tick the moment it is made, which is right for a dropdown you can see the
   * page behind. FilterSheet does, because a sheet covers the page and there is
   * nothing to watch change until it closes.
   */
  onReplace: (next: Set<string>) => void;
  /** How to show an option, when it reads better than the raw value. */
  display?: (value: string) => string;
};

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
  const current = facets.find((f) => f.key === openFacet) ?? null;

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
        {!opened ? null : current ? (
          <>
            {/* One row, always the same height, with Clear in it rather than
                under it. It used to appear as its own line the moment a box was
                ticked, which pushed the whole list down by its height under the
                pointer that had just ticked it — so the next option you meant
                to click had moved. Now the row is there either way and only its
                right-hand side fills in. */}
            <div className="filter-menu-head">
              <button
                type="button"
                className="filter-menu-back"
                onClick={() => setOpenFacet(null)}
                aria-label="Back to all filters"
              >
                <ChevronLeft size={14} strokeWidth={1.75} aria-hidden="true" />
                {current.label}
              </button>
              {current.selected.size > 0 && (
                <button type="button" className="filter-menu-clear" onClick={current.onClear}>
                  Clear
                </button>
              )}
            </div>
            <ul>
              {current.options.map((o) => (
                <li key={o.value}>
                  <label>
                    <input
                      type="checkbox"
                      checked={current.selected.has(o.value)}
                      onChange={() => current.onToggle(o.value)}
                    />
                    <span className="filter-menu-name">
                      {current.display ? current.display(o.value) : o.value}
                    </span>
                    <span className="filter-menu-count">{o.count}</span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            {/* A facet of two or three answers is shown here rather than behind
                a row of its own: going a level in to tick one of two boxes is a
                press to reach a press. Era is the reason this exists — it is
                Vintage and Modern and nothing else — and Owned is the same
                shape. Anything longer stays a row, because several hundred
                Pokémon do not belong in a panel you opened to glance at. */}
            {facets
              .filter((f) => f.options.length > 0 && f.options.length <= INLINE_MAX)
              .map((f) => (
                <div key={f.key} className="filter-menu-inline">
                  <span className="filter-menu-inline-label">{f.label}</span>
                  <div className="cards-segmented" role="group" aria-label={f.label}>
                    {/* Ticking nothing is an answer, and on a facet of two it
                        is the commonest one — so it gets a word rather than
                        being the state you reach by untickig whatever is on.
                        Selected means the set is empty, which is exactly what
                        this button writes. */}
                    <button
                      type="button"
                      className={`cards-segment${f.selected.size === 0 ? " is-active" : ""}`}
                      aria-pressed={f.selected.size === 0}
                      onClick={() => f.onReplace(new Set())}
                    >
                      All
                    </button>
                    {f.options.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        className={`cards-segment${f.selected.has(o.value) ? " is-active" : ""}`}
                        aria-pressed={f.selected.has(o.value)}
                        onClick={() => f.onToggle(o.value)}
                      >
                        {f.display ? f.display(o.value) : o.value}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            <ul>
            {facets.filter((f) => f.options.length > INLINE_MAX).map((f) => (
              <li key={f.key}>
                <button
                  type="button"
                  className="filter-menu-facet"
                  onClick={() => setOpenFacet(f.key)}
                >
                  <span className="filter-menu-name">{f.label}</span>
                  {/* Both are a bare number on screen, and the difference
                      between them is a tick you cannot hear. "Type, 3" could be
                      three selected or three to choose from, so the row says
                      which. */}
                  {f.selected.size > 0 ? (
                    <span className="filter-menu-on">
                      <Check size={13} strokeWidth={1.75} aria-hidden="true" />
                      <span aria-hidden="true">{f.selected.size}</span>
                      <span className="sr-only">{f.selected.size} selected</span>
                    </span>
                  ) : (
                    <span className="filter-menu-count">
                      <span aria-hidden="true">{f.options.length}</span>
                      <span className="sr-only">{f.options.length} options</span>
                    </span>
                  )}
                  <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </li>
            ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}
