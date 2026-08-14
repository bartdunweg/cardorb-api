"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { CardSet } from "../../lib/core/cards";
import { eraYears, groupByEra, eraLabel } from "../../lib/core/eras";
import { slugify } from "../../lib/core/slug";
import { LOCALE } from "../../lib/core/config";

/**
 * Every set, as a screen rather than as a column.
 *
 * This is what replaced the pane swap, and the swap is worth remembering to
 * understand the shape. Below 1000px the rail and the results used to take
 * turns: pressing a set hid the list, a button brought it back. That existed
 * because fifty-one set names do not fit in a column beside a grid — and the
 * fix was a second navigation model living alongside the real one, with no
 * address of its own.
 *
 * A set index solves the same problem by being a place. It has a URL, it works
 * at every width, the back button leaves it, and it can show what a rail row
 * never had room for: how much of each set is actually held. That last part is
 * the reason to build it rather than a list of links — "12 of 191" is the
 * question a collector is asking when they open a set at all.
 */
export default function SetIndex({ sets }: { sets: CardSet[] }) {
  const groups = useMemo(() => {
    const span = eraYears(sets);
    return groupByEra(sets).map((g) => ({ ...g, label: eraLabel(g.era, span) }));
  }, [sets]);

  const n = (v: number) => v.toLocaleString(LOCALE);

  if (!sets.length) {
    return (
      <p className="cards-empty">
        No sets yet. Add a card and the set it came from appears here.
      </p>
    );
  }

  return (
    <div className="set-index">
      {groups.map((group) => (
        <section key={group.era} className="set-index-era">
          <h2 className="set-index-era-title">{group.label}</h2>

          <ul className="set-index-grid" role="list">
            {group.sets.map((set) => {
              const held = set.cards.filter((c) => c.owned).length;
              // The set's own total where the catalogue knows it. Without one
              // there is no denominator, so the tile says what it has rather
              // than inventing a fraction — "12 cards" is honest, "12 of 12"
              // would claim a complete set.
              const total = set.total ?? null;
              const pct = total ? Math.min(100, Math.round((held / total) * 100)) : null;

              return (
                <li key={set.name}>
                  <Link
                    href={`/collection/set/${slugify(set.name)}`}
                    className="set-index-tile"
                  >
                    {/* The logo carries the recognition, so it goes first and
                        large. A set is remembered by its wordmark long before
                        its name is read. */}
                    <span className="set-index-logo">
                      {set.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={set.logo} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <span className="set-index-logo-fallback">{set.title ?? set.name}</span>
                      )}
                    </span>

                    <span className="set-index-name">{set.title ?? set.name}</span>

                    <span className="set-index-count">
                      {total ? `${n(held)} of ${n(total)}` : `${n(held)} ${held === 1 ? "card" : "cards"}`}
                    </span>

                    {pct !== null && (
                      /* Not a progress element: this is a static readout, and
                         <progress> announces itself as a live task. The number
                         above it is the accessible answer, so the bar is
                         decorative and hidden from the accessibility tree. */
                      <span className="set-index-bar" aria-hidden="true">
                        <span className="set-index-bar-fill" style={{ width: `${pct}%` }} />
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
