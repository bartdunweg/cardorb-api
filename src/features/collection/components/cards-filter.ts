/**
 * What the collection screen decides, with no React around it.
 *
 * These were closures inside CardsView, a 1,760-line client component, and
 * that is the only reason none of them had a test: reaching `filtered` meant
 * rendering the whole page, mocking a session and an IntersectionObserver to
 * assert on an array. The arithmetic is the part that breaks silently — a
 * filter that quietly drops a card looks exactly like a collection that does
 * not have one — so it lives here, where a test can call it directly.
 *
 * Nothing here knows about rendering. CardsView still owns the state; this
 * owns what the state means.
 */

import { shownPrice } from "@/lib/core/collection/cards";
import type { CardSet, OwnedCard } from "@/lib/core/collection/cards";
import { LOCALE } from "@/lib/core/config";

/** "November 2024" from the ISO date TCGdex hands out, when it knows one. */
export function releasedIn(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
}

/** Lower-case and stripped of accents, so "Pokémon" is found by "pokemon". */
export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * What a set amounts to: how much of it is held, and when it came out.
 *
 * "of N" only while the two agree. A Notion set name can cover several TCGdex
 * subsets, and `total` is the base set's official count, so a set built from
 * subsets read "170 of 86" and looked broken. Where the pair cannot be true,
 * the count that certainly is gets shown alone.
 */
export function setMeta(set: CardSet) {
  const held =
    set.total && set.cards.length <= set.total
      ? `${set.cards.length} of ${set.total}`
      : `${set.cards.length} owned`;
  const when = releasedIn(set.releaseDate);
  return when ? `${held} · ${when}` : held;
}

/** Before this year, a set is vintage. One number, in one place. */
export const VINTAGE_BEFORE = 2010;

/**
 * Which eras count as vintage, from the earliest set each one appears in.
 *
 * Takes the map `eraYears()` returns — era name to [first year, last year] —
 * rather than the sets, so the rule is one comparison and not a second walk.
 */
export function vintageEras(years: Iterable<[string, readonly [number, number]]>) {
  const out = new Set<string>();
  for (const [gen, [from]] of years) if (from < VINTAGE_BEFORE) out.add(gen);
  return out;
}

/**
 * Bands rather than a slider: a slider over a range this skewed (a €5.68
 * median under a €3,250 top card) spends nine tenths of its travel on the
 * last twenty cards. The edges are round numbers a collector already thinks
 * in.
 */
export const VALUE_BANDS = [
  { value: "Under €5", test: (n: number) => n < 5 },
  { value: "€5 – €25", test: (n: number) => n >= 5 && n < 25 },
  { value: "€25 – €100", test: (n: number) => n >= 25 && n < 100 },
  { value: "€100 and up", test: (n: number) => n >= 100 },
] as const;

export function matchesValue(c: OwnedCard, picked: ReadonlySet<string>) {
  if (!picked.size) return true;
  const n = shownPrice(c.price);
  // A card with no price cannot be in a band. It is not worth nothing, it is
  // unknown, and putting it in "under €5" would be inventing a fact.
  if (n == null) return false;
  return VALUE_BANDS.some((b) => picked.has(b.value) && b.test(n));
}

export function matchesOwnership(c: OwnedCard, picked: ReadonlySet<string>) {
  return (
    !picked.size ||
    (picked.has("In the binder") && c.owned) ||
    (picked.has("On the wishlist") && !c.owned)
  );
}

export type CardSort = "set" | "value" | "value-asc";

/** Everything the filter reads, in the shape CardsView already holds it. */
export type FilterState = {
  /** The search box, untrimmed — this trims and normalises it. */
  query: string;
  /** A set name, an `era:<name>`, or one of `all` / `wishlist` / `dashboard`. */
  selected: string;
  sort: CardSort;
  pickedEras: ReadonlySet<string>;
  pickedTypes: ReadonlySet<string>;
  pickedRarities: ReadonlySet<string>;
  pickedOwnership: ReadonlySet<string>;
  pickedValues: ReadonlySet<string>;
  /** From vintageEras() — which era names are on the vintage side of 2010. */
  vintage: ReadonlySet<string>;
};

/**
 * The sets that survive the search box, the tick boxes and the sort.
 *
 * `scope` is already the right side of the collection — the wishlist screen is
 * the one that runs over cards you do not hold, and picking that is the
 * caller's job so there is no view left where the two can be mixed by
 * accident.
 */
export function filterSets(scope: readonly CardSet[], state: FilterState): CardSet[] {
  const q = norm(state.query.trim());
  return scope
    .map((set) => {
      // "era:Base" keeps every set that holds a card from it; the cards
      // themselves are narrowed below. A plain set name keeps just that set.
      if (state.selected.startsWith("era:")) {
        const want = state.selected.slice(4);
        if (!set.cards.some((c) => c.gen === want)) return null;
      } else if (
        state.selected !== "all" &&
        state.selected !== "wishlist" &&
        state.selected !== "dashboard" &&
        set.name !== state.selected
      ) {
        return null;
      }
      // A set whose name matches the search keeps all of its cards: typing
      // "surging" is asking for the set, not for cards with that word in them.
      // The tick boxes still apply on top of it.
      const bySetName = q !== "" && norm(set.name).includes(q);
      const cards = set.cards.filter((c) => {
        if (state.selected.startsWith("era:") && c.gen !== state.selected.slice(4)) return false;
        // Vintage or modern, decided by the set's own release date rather than
        // by a list kept by hand. See vintageEras.
        if (state.pickedEras.size) {
          const isVintage = c.gen ? state.vintage.has(c.gen) : false;
          if (!state.pickedEras.has(isVintage ? "Vintage" : "Modern")) return false;
        }
        if (state.pickedTypes.size && !state.pickedTypes.has(c.type ?? "")) return false;
        if (!matchesOwnership(c, state.pickedOwnership)) return false;
        if (!matchesValue(c, state.pickedValues)) return false;
        if (
          state.pickedRarities.size &&
          !c.variants.some((v) => state.pickedRarities.has(v.rarity ?? ""))
        )
          return false;
        if (!q || bySetName) return true;
        return (
          norm(c.name).includes(q) ||
          norm(c.number).includes(q) ||
          norm(c.type ?? "").includes(q) ||
          norm(c.gen ?? "").includes(q) ||
          c.variants.some((v) => norm(v.rarity ?? "").includes(q))
        );
      });
      if (!cards.length) return null;
      // Sorted within the set, not across the collection: the page is a shelf
      // of sets and flattening it would throw away the one thing the grouping
      // tells you. A card with no price sorts last either way, unknown is not
      // the cheapest.
      const ordered =
        state.sort === "set"
          ? cards
          : [...cards].sort((a, b) => {
              const x = shownPrice(a.price);
              const y = shownPrice(b.price);
              if (x === null && y === null) return 0;
              if (x === null) return 1;
              if (y === null) return -1;
              return state.sort === "value" ? y - x : x - y;
            });
      return { ...set, cards: ordered };
    })
    .filter(Boolean) as CardSet[];
}

/**
 * The same cards under the year their set came out, newest first.
 *
 * Grouped on the set's release date rather than on the card's era, which is
 * the other date this collection knows: an era spans years and answers "which
 * generation", while this answers "when did I get to open these", which is the
 * question a shelf sorted by time is actually asked. A set with no date at
 * TCGdex lands under Undated rather than under a guess.
 */
export function groupByYear(sets: readonly CardSet[]): CardSet[] {
  const by = new Map<string, CardSet>();
  for (const set of sets) {
    const year = set.releaseDate?.slice(0, 4) ?? "Undated";
    const at = by.get(year);
    if (at) at.cards.push(...set.cards);
    else
      by.set(year, {
        ...set,
        name: year,
        logo: null,
        logoSize: null,
        total: null,
        cards: [...set.cards],
      });
  }
  return [...by.values()].sort((a, b) => b.name.localeCompare(a.name));
}
