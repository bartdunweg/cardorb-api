"use client";

import Link from "next/link";
import { SearchLg } from "@untitledui-pro/icons/line";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { InputBase } from "@/components/base/input/input";
import { cardsMainTitleClassName } from "@/components/custom/cardsPageClasses";
import { useDeferredValue, useMemo, useState } from "react";
import { LOCALE } from "@/lib/core/config";
import { norm } from "@/lib/core/util";
import type { CatalogueSet } from "@/lib/core/ptcg-browse";

/** A set as the browse index shows it: the catalogue's, plus what you hold. */
export type BrowsableSet = CatalogueSet & { ownedCount: number; wishlistCount: number };

/**
 * Every set there is, not every set you own.
 *
 * SetIndex.tsx beside this one answers the other question, and the two are
 * deliberately separate screens rather than a toggle: "how far into Silver
 * Tempest am I" and "what else is there" are asked at different moments, and a
 * switch between them would make each one a state the other has to be read
 * out of. They link to each other instead.
 *
 * The tile is SetIndex's, on purpose — same logo-first shape, same fraction,
 * same progress bar — because they are two views of one idea and a collector
 * moving between them should not have to re-learn what a tile means. What is
 * different is the denominator: here it is always the catalogue's total, so
 * a set with nothing in it reads "0 of 207" rather than disappearing.
 */
export default function BrowseSetIndex({ sets }: { sets: BrowsableSet[] }) {
  const [query, setQuery] = useState("");
  /* The list is 174 items and filtering it is a norm() per set — cheap, but it
     happens on every keystroke while the input has to stay responsive. Deferred
     so the character you typed paints before the grid re-filters. */
  const term = norm(useDeferredValue(query));

  const groups = useMemo(() => {
    const matching = term
      ? sets.filter((set) => norm(set.name).includes(term) || norm(set.series).includes(term))
      : sets;
    /* Grouped in encounter order, so the series come out newest-first the way
       the sets inside them already are — sorted in ptcg-browse.ts. */
    const out: { series: string; sets: BrowsableSet[] }[] = [];
    for (const set of matching) {
      const last = out[out.length - 1];
      if (last?.series === set.series) last.sets.push(set);
      else out.push({ series: set.series, sets: [set] });
    }
    return out;
  }, [sets, term]);

  const n = (v: number) => v.toLocaleString(LOCALE);
  const found = groups.reduce((sum, g) => sum + g.sets.length, 0);

  return (
    <div className="flex flex-col gap-6 pb-[var(--page-pad-bottom)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h1 className={cardsMainTitleClassName}>Browse sets</h1>
        <Link
          href="/collection/sets"
          className="font-body text-xs text-secondary
            underline underline-offset-2 hover:text-primary"
        >
          Only your sets
        </Link>
      </div>

      <p className="font-body text-sm text-secondary m-0 max-w-[60ch]">
        Every set in the catalogue, including the ones you have nothing from yet. Open one to see
        all its cards and which of them are already yours.
      </p>

      {/* type="search" rather than text: it gets the clear affordance and the
          right keyboard on iOS for free, which is the same reason the add
          dialog's box is one. */}
      {/* Untitled UI's `InputBase`, which carries the leading icon itself — the
          absolutely-positioned `<SearchLg>` and the `pl-10` that cleared it are
          both gone with it. This field was also the last one in the app still
          drawing its own hover shadow and its own focus border; theirs puts the
          focus ring on the wrapper, which is what every other field here now
          does. */}
      <div className="max-w-[420px]">
        <InputBase
          icon={SearchLg}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a set"
          aria-label="Find a set"
        />
      </div>

      {/* Announced rather than merely displayed: the grid below changes as you
          type, and a screen reader following the input gets no other signal
          that it did. */}
      <p aria-live="polite" className="sr-only">
        {found} {found === 1 ? "set" : "sets"} shown
      </p>

      {!found ? (
        /* Three parts of EmptyState, not eleven — see the note in SetIndex.tsx. */
        <EmptyState size="sm" className="gap-2 py-8">
          <EmptyState.Header>
            <EmptyState.FeaturedIcon color="gray" icon={SearchLg} />
          </EmptyState.Header>
          <EmptyState.Description>
            No set matches “{query.trim()}”.
          </EmptyState.Description>
        </EmptyState>
      ) : (
        groups.map((group) => (
          <section key={group.series} className="flex flex-col gap-4">
            <h2 className="text-display-sm font-semibold text-primary m-0">
              {group.series}
            </h2>

            {/* Auto-fill rather than a column count, for the reason SetIndex
                gives: .cards-main is a container, so a fixed count would need
                container queries to do what the browser already does. */}
            <ul
              className="grid [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))] gap-3 m-0 p-0 list-none"
              role="list"
            >
              {group.sets.map((set) => {
                const pct = set.total
                  ? Math.min(100, Math.round((set.ownedCount / set.total) * 100))
                  : null;
                return (
                  <li key={set.id}>
                    <Link
                      href={`/collection/browse/${set.id}`}
                      className="flex flex-col gap-2 p-4 rounded-orb-lg bg-primary
                        shadow-xs no-underline text-inherit
                        transition duration-150 ease-out
                        hover:-translate-y-0.5 hover:shadow-lg"
                    >
                      {/* Height reserved before the logo lands, so a lazy image
                          does not shunt the name and the count down as it
                          decodes. Same trick as SetIndex. */}
                      <span className="flex items-center justify-start h-11">
                        {set.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={set.logo}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="max-h-full max-w-[70%] object-contain object-left"
                          />
                        ) : (
                          <span className="text-xs font-semibold text-tertiary">
                            {set.name}
                          </span>
                        )}
                      </span>

                      <span className="text-sm font-semibold text-primary">
                        {set.name}
                      </span>

                      <span className="text-xs text-secondary tabular-nums">
                        {set.total ? `${n(set.ownedCount)} of ${n(set.total)}` : "Cards unknown"}
                      </span>

                      {pct !== null && (
                        /* Decorative: the fraction above is the accessible
                           answer, and <progress> would announce itself as a
                           live task. SetIndex makes the same call. */
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
        ))
      )}
    </div>
  );
}
