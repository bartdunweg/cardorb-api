/**
 * What the collection adds up to, for the dashboard on /cards.
 *
 * Derived from the same `CardSet[]` the page already has, so there is no second
 * source to keep in step and nothing here talks to Notion or TCGdex. Pure, and
 * separate from the component, because the arithmetic is the part worth testing:
 * a total that quietly counts the wishlist as owned is wrong in a way nobody
 * notices by looking at it.
 */

import { shownPrice } from "./cards";
import { LOCALE } from "./config";
import type { CardSet, OwnedCard } from "./cards";

export type Tally = { value: string; count: number };

export type CardsStats = {
  /** Every row, held or wanted. */
  cards: number;
  owned: number;
  wishlist: number;
  sets: number;
  /**
   * The held cards' prices added up, in euros, over the ones that have a price.
   *
   * On `price.market`, which is what a single copy trades at, so this is a
   * valuation. It used to add up `price.from`, Cardmarket's lowest listing at
   * any condition in any language, and that made this number meaningless rather
   * than merely conservative: 421 of the 1,211 priced cards here list under
   * €0.10 because their cheapest listing is a bulk lot, and the total came to
   * €9,355 against €25,880 on the same cards valued one at a time.
   */
  value: number;
  /** How many held cards actually carried a price, so the figure can say so. */
  priced: number;
  /** Held cards, priciest first, each with the set it came out of. */
  top: { card: OwnedCard; set: string }[];
  byEra: Tally[];
  byType: Tally[];
};

/**
 * Commonest first, and alphabetical within a tie so the order is stable.
 *
 * Exported because CardsView had a byte-identical copy, built for its filter
 * menu rather than for the dashboard. Two implementations of "count these and
 * sort them" is how the same page ends up ordering the same values two
 * different ways.
 */
export function tally(values: (string | null)[]): Tally[] {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, LOCALE));
}

export function getCardsStats(sets: CardSet[], topCount = 10): CardsStats {
  // Paired with their set on the way in: a card knows its number and its name
  // but not which set it came out of, and "Charizard, €300" without that is half
  // an answer to a collector.
  const withSet = sets.flatMap((s) => s.cards.map((card) => ({ card, set: s.name })));
  const all = withSet.map((x) => x.card);
  const owned = all.filter((c) => c.owned);
  const priced = withSet.filter((x) => x.card.owned && shownPrice(x.card.price) != null);

  return {
    cards: all.length,
    owned: owned.length,
    wishlist: all.length - owned.length,
    sets: sets.length,
    value: priced.reduce((sum, x) => sum + (shownPrice(x.card.price) ?? 0), 0),
    priced: priced.length,
    // Only what is held: the wishlist is a list of cards Bart does not have, and
    // ranking them by price would be a table of things he wants, under a heading
    // that says these are his.
    top: [...priced]
      .sort((a, b) => (shownPrice(b.card.price) ?? 0) - (shownPrice(a.card.price) ?? 0))
      .slice(0, topCount),
    byEra: tally(all.map((c) => c.gen)),
    byType: tally(all.map((c) => c.type)),
  };
}
