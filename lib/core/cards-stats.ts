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

/**
 * How many copies of this card are actually in the binder.
 *
 * Summed over the owned variants, because that is where a quantity lives: a
 * card held normally and again as a reverse holo is one OwnedCard with two
 * Variants, and each carries its own count (see Variant, and the 2026-08-14
 * per-variant inventory fields). A wishlist variant is not a copy however many
 * of it is wanted, so `owned` gates the sum rather than filtering afterwards.
 *
 * `excluded` deliberately does not gate it. That flag means "keep this out of
 * the latest-pull feed on the portfolio site" — the card is still held, and a
 * valuation that quietly dropped it would be wrong in the one direction nobody
 * checks.
 *
 * Math.max guards a row that somehow holds a negative: the column has a check
 * constraint, but this also runs on drafts and on whatever a CSV import made,
 * and a negative here would subtract from the collection's value.
 *
 * A null quantity counts as nothing rather than as one. That is a public
 * payload — forPublic() nulls it, because how many of a card somebody holds is
 * theirs to know — and a stranger's browser has no business totalling a
 * collection it was deliberately not told the size of. In practice it never
 * arises: CardsView computes no stats at all when it is public.
 */
export const copiesHeld = (card: OwnedCard): number =>
  card.variants.reduce((n, v) => n + (v.owned ? Math.max(0, v.quantity ?? 0) : 0), 0);

export type Tally = { value: string; count: number };

export type CardsStats = {
  /** Every row, held or wanted. */
  cards: number;
  owned: number;
  wishlist: number;
  sets: number;
  /**
   * What the binder is worth, in euros: every copy held, at what one copy of it
   * trades for.
   *
   * On `price.market`, which is what a single copy trades at, so this is a
   * valuation. It used to add up `price.from`, Cardmarket's lowest listing at
   * any condition in any language, and that made this number meaningless rather
   * than merely conservative: 421 of the 1,211 priced cards here list under
   * €0.10 because their cheapest listing is a bulk lot, and the total came to
   * €9,355 against €25,880 on the same cards valued one at a time.
   *
   * Multiplied by copiesHeld() rather than counted once per card. It was once
   * per card until the per-variant quantity column existed to say otherwise,
   * and afterwards it was simply a figure that had stopped being true: a card
   * held three times was valued as one. The snapshot script multiplies the same
   * way, because this tile and the chart under it are the same number a
   * different width apart, and one of them counting stacks while the other
   * counted cards would be the dashboard disagreeing with itself.
   */
  value: number;
  /**
   * How many held cards actually carried a price, so the figure can say so.
   *
   * Distinct cards, not copies, deliberately: this answers "how much of your
   * collection could be valued at all", which is a question about coverage.
   * Counting stacks here would make a well-priced collection of singles look
   * worse than a badly-priced one with duplicates in it.
   */
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
    value: priced.reduce((sum, x) => sum + (shownPrice(x.card.price) ?? 0) * copiesHeld(x.card), 0),
    priced: priced.length,
    // Only what is held: the wishlist is a list of cards Bart does not have, and
    // ranking them by price would be a table of things he wants, under a heading
    // that says these are his.
    //
    // Ranked and shown per single copy, unlike `value` above. This is a list of
    // the most valuable cards, and ranking by what a stack is worth would put
    // forty of a cheap common above a Charizard — a true sentence about money
    // and the wrong answer to "which are my best cards".
    top: [...priced]
      .sort((a, b) => (shownPrice(b.card.price) ?? 0) - (shownPrice(a.card.price) ?? 0))
      .slice(0, topCount),
    byEra: tally(all.map((c) => c.gen)),
    byType: tally(all.map((c) => c.type)),
  };
}
