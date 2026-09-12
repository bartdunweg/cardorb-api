/**
 * Which of your cards moved, and by how much.
 *
 * The question the value chart cannot answer. That line says the collection is
 * up two hundred euros; this says the two hundred is one Charizard, or that it
 * is four hundred up and two hundred down and the total is hiding both.
 *
 * Pure, and separate from everything that fetches, because the arithmetic is
 * the part worth testing: a mover computed from one reading, or from a card the
 * owner does not hold, or from a price that changed only because the card's
 * finish was corrected, is wrong in a way that looks entirely plausible on a
 * dashboard.
 */

import { isReverseFinish } from "./collection-row";
import { copiesHeld } from "./cards-stats";
import type { CardSet, OwnedCard } from "./cards";

/** One dated reading for one card. Euros, both printings. */
export type CardPricePoint = {
  tcgId: string;
  /** ISO yyyy-mm-dd. */
  date: string;
  /** The normal printing, or null where the market published nothing. */
  market: number | null;
  /** The foil, or null where there is no separate foil price. */
  holo: number | null;
  /**
   * Which market the reading is from, as card_prices.source stores it. Required on the way in:
   * the column defaults to 'cardmarket', so a point written without one was labelled with the
   * market it was not from (every nightly TCGplayer point, for the hours after 2026-09-12's
   * change). Absent on the way out, where nothing reads it yet.
   */
  source?: "tcgplayer" | "tcgplayer-sales" | "cardmarket";
};

/** A reading on its way into card_prices, which always says which market it is from. */
export type SourcedPricePoint = CardPricePoint & { source: NonNullable<CardPricePoint["source"]> };

export type Mover = {
  card: OwnedCard;
  set: string;
  /** What one copy was worth at the earliest reading in the window. */
  was: number;
  /** And at the latest. */
  now: number;
  /** now − was, per copy. */
  change: number;
  /** The same as a fraction of `was`. */
  pct: number;
  /** change × copies held, which is what it did to the collection's total. */
  total: number;
  from: string;
  to: string;
};

/**
 * The price of the printing this person actually holds.
 *
 * The same rule as variantPrice() in cards.ts, applied to a stored reading
 * rather than to a live Price: the foil figure only for a reverse holo, and
 * only where there is one. A card held both ways takes the dearer of the two,
 * because a mover is about the card and showing it twice under one name would
 * read as a duplicate.
 */
function held(card: OwnedCard, point: CardPricePoint): number | null {
  let best: number | null = null;
  for (const v of card.variants) {
    if (!v.owned) continue;
    const each = (isReverseFinish(v.finish) && point.holo) || point.market;
    if (each != null && (best == null || each > best)) best = each;
  }
  return best;
}

export type MoversOptions = {
  /** How many each way. */
  top?: number;
  /**
   * The smallest change worth reporting, in euros per copy.
   *
   * Cardmarket's figures wobble by a cent or two on thin markets, and a list of
   * commons that moved three cents is a list nobody reads twice. Ten cents is
   * low enough to keep a real move on a cheap card and high enough to drop the
   * noise.
   */
  minChange?: number;
};

/**
 * Risers and fallers over whatever window the readings cover.
 *
 * `was` is the earliest reading available per card and `now` the latest, rather
 * than a fixed thirty days: the series is weekly and young, and a card added
 * last month has less history than one that has been here since the table
 * existed. Each card is compared against its own earliest point, and the dates
 * travel with it so the page can say what it compared.
 *
 * A card with one reading is not a mover — it is a card with one reading — and
 * is left out rather than counted as having moved nothing.
 */
export function moversOf(
  sets: CardSet[],
  points: CardPricePoint[],
  { top = 5, minChange = 0.1 }: MoversOptions = {},
): { up: Mover[]; down: Mover[] } {
  const byId = new Map<string, CardPricePoint[]>();
  for (const p of points) {
    if (!byId.has(p.tcgId)) byId.set(p.tcgId, []);
    byId.get(p.tcgId)!.push(p);
  }

  const movers: Mover[] = [];
  for (const set of sets) {
    for (const card of set.cards) {
      if (!card.tcgId) continue;
      const copies = copiesHeld(card);
      if (!copies) continue;

      // Sorted here rather than trusted from the query: this is a pure
      // function and a caller that hands them over shuffled should still get
      // the right answer.
      const series = (byId.get(card.tcgId) ?? [])
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date));
      if (series.length < 2) continue;

      const first = series[0]!;
      const last = series.at(-1)!;
      const was = held(card, first);
      const now = held(card, last);
      if (was == null || now == null || was <= 0) continue;

      const change = now - was;
      if (Math.abs(change) < minChange) continue;

      movers.push({
        card,
        set: set.name,
        was,
        now,
        change,
        pct: change / was,
        total: change * copies,
        from: first.date,
        to: last.date,
      });
    }
  }

  // Ranked by what it did to the collection, not by percentage: a common that
  // doubled from four cents is a bigger number and a smaller event than a
  // Charizard that gained eight euros.
  const byTotal = [...movers].sort((a, b) => b.total - a.total);
  return {
    up: byTotal.filter((m) => m.total > 0).slice(0, top),
    down: byTotal
      .filter((m) => m.total < 0)
      .reverse()
      .slice(0, top),
  };
}
