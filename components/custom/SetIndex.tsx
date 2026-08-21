"use client";

import Link from "next/link";
import { cardsMainTitleClassName } from "@/components/custom/cardsPageClasses";
import { useMemo } from "react";
import type { CardSet } from "@/lib/core/cards";
import { eraYears, groupByEra, eraLabel } from "@/lib/core/eras";
import { slugify } from "@/lib/core/slug";
import { LOCALE } from "@/lib/core/config";
import { retryAsPng } from "@/components/custom/CardsSidebar";

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

  /* The way out of this screen when the answer to "which sets" is "none of
     them yet", and the way to the wider question when it is not. /collection/
     browse lists every set there is; this one lists the sets you have a card
     in, and an empty version of this page used to be a dead end. */
  const browseLink = (
    <Link
      href="/collection/browse"
      className="font-body text-xs text-secondary
        underline underline-offset-2 hover:text-primary"
    >
      Browse every set
    </Link>
  );

  if (!sets.length) {
    return (
      <>
        <h1 className={`${cardsMainTitleClassName} mb-4`}>Sets</h1>
        <p className="cards-empty">
          No sets yet. Add a card and the set it came from appears here.
        </p>
        <p className="mt-3">{browseLink}</p>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-10 pb-[var(--page-pad-bottom)]">
      {/* cardsMainTitleClassName, the same page-title style Dashboard/Settings/
          Collection/Wishlist all share — this screen had none at all before. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h1 className={cardsMainTitleClassName}>Sets</h1>
        {browseLink}
      </div>
      {groups.map((group) => (
        <section key={group.era}>
          <h2 className="text-display-sm font-semibold text-primary m-0 mb-4">
            {group.label}
          </h2>

          {/* Auto-fill rather than a column count: the tile has a natural
              width and the row takes as many as fit. A fixed count needs a
              breakpoint per step, and this grid sits inside .cards-main,
              which is a container — so the query it would need is a container
              query, and none of that is necessary when the browser can
              divide. */}
          <ul
            className="grid [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))] gap-3 m-0 p-0 list-none"
            role="list"
          >
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
                    className="flex flex-col gap-2 p-4 rounded-orb-lg bg-primary
                      shadow-xs no-underline text-inherit
                      transition duration-150 ease-out
                      hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    {/* The logo carries the recognition, so it goes first and
                        large. A set is remembered by its wordmark long before
                        its name is read. Height reserved before the logo
                        lands, so a lazy image does not shunt the name and the
                        count down the moment it decodes. Same reason the card
                        scans carry an aspect-ratio. */}
                    <span className="flex items-center justify-start h-11">
                      {set.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={set.logo}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="max-h-full max-w-[70%] object-contain object-left"
                          // A set as new as Pitch Black only has logo.png —
                          // TCGdex has not published a .webp for it yet — so
                          // the first request 404s. See retryAsPng's own
                          // comment (CardsSidebar.tsx), which this page had
                          // never carried a copy of.
                          onError={(e) => retryAsPng(e.currentTarget)}
                        />
                      ) : (
                        <span className="text-xs font-semibold text-tertiary">
                          {set.title ?? set.name}
                        </span>
                      )}
                    </span>

                    <span className="text-sm font-semibold text-primary">
                      {set.title ?? set.name}
                    </span>

                    <span className="text-xs text-secondary tabular-nums">
                      {total
                        ? `${n(held)} of ${n(total)}`
                        : `${n(held)} ${held === 1 ? "card" : "cards"}`}
                    </span>

                    {pct !== null && (
                      /* Not a progress element: this is a static readout, and
                         <progress> announces itself as a live task. The number
                         above it is the accessible answer, so the bar is
                         decorative and hidden from the accessibility tree. */
                      <span
                        className="h-[3px] rounded-[2px] bg-secondary overflow-hidden"
                        aria-hidden="true"
                      >
                        <span
                          className="block h-full rounded-[inherit] bg-brand-solid"
                          style={{ width: `${pct}%` }}
                        />
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
