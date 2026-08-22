/**
 * The sets, under the era they belong to.
 *
 * Lifted out of CardsView, where it was a useMemo halfway down a 1,900-line
 * component, because two things need it now: the rail that has always drawn it,
 * and the set index that is becoming a screen with an address of its own. A
 * grouping computed twice is a grouping that can disagree with itself, and the
 * disagreement would be which era a set is filed under — visible, and confusing
 * in a way nobody would think to check.
 *
 * Pure, so it is testable in node, which is the only kind of test this project
 * can run over anything that used to live in a component.
 */

import type { CardSet } from "../collection/cards";
import { LOCALE } from "../config";

export type EraGroup = {
  /** The era as the collection records it: "Base", "Scarlet & Violet". */
  era: string;
  /** The same, with the years it spans: "Base (1999–2000)". */
  label: string;
  sets: CardSet[];
};

/**
 * The years each era covers, from the release dates of the sets in it.
 *
 * Measured rather than looked up. An era's dates are a fact about which sets a
 * collection happens to hold, so a binder with one Base Set card spans one year
 * and one with the whole run spans two, and both are the truthful answer for
 * the person reading it.
 */
export function eraYears(sets: CardSet[]): Map<string, [number, number]> {
  const span = new Map<string, [number, number]>();
  for (const set of sets) {
    const year = Number(set.releaseDate?.slice(0, 4));
    if (!Number.isFinite(year)) continue;
    for (const card of set.cards) {
      if (!card.gen) continue;
      const cur = span.get(card.gen);
      span.set(card.gen, cur ? [Math.min(cur[0], year), Math.max(cur[1], year)] : [year, year]);
    }
  }
  return span;
}

/** An era's name with its years after it, or just its name where it has none. */
export function eraLabel(era: string, span: Map<string, [number, number]>): string {
  const y = span.get(era);
  if (!y) return era;
  return `${era} (${y[0] === y[1] ? y[0] : `${y[0]}–${y[1]}`})`;
}

/**
 * Every set that has something in it, grouped by era, newest first.
 *
 * A set belongs to whichever era most of its cards say it does. That is a vote
 * rather than a lookup because the era is recorded per card, by hand, and a
 * handful of rows in a fifty-card set can disagree with the rest — filing the
 * set under a one-card minority would move it away from the sets it sits beside
 * in a binder.
 *
 * `sets` is expected to be already scoped to what is held. A set that is only
 * on the wishlist is deliberately not here: it would read "0" and open onto
 * nothing, which looks like a set that failed to load rather than one that has
 * not been started. Those stay reachable under Wishlist, where a card you do
 * not own belongs.
 */
export function groupByEra(sets: CardSet[]): EraGroup[] {
  const years = eraYears(sets);
  const groups = new Map<string, CardSet[]>();

  for (const set of sets) {
    const counts = new Map<string, number>();
    for (const card of set.cards) {
      if (card.gen) counts.set(card.gen, (counts.get(card.gen) ?? 0) + 1);
    }
    const era = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Other";
    groups.set(era, [...(groups.get(era) ?? []), set]);
  }

  return (
    [...groups.entries()]
      .map(([era, inEra]) => ({
        era,
        label: eraLabel(era, years),
        // Newest set first inside the era, which is the order a collection is
        // actually browsed: the last pack you opened is the one you want.
        sets: [...inEra].sort((a, b) =>
          (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "", LOCALE),
        ),
      }))
      // Newest era first, for the same reason. Anything unlabelled sorts last.
      .sort((a, b) => (years.get(b.era)?.[1] ?? -Infinity) - (years.get(a.era)?.[1] ?? -Infinity))
  );
}
