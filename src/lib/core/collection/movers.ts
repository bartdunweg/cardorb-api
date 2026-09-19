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
import { printingKeysOf } from "../price-basis.mjs";
import { type PriceLanguage, historyKey, priceLanguageOf } from "../price-months.mjs";
import { copiesHeld } from "./cards-stats";
import type { CardSet, OwnedCard } from "./cards";

/** One dated reading for one card. Euros, both printings. */
export type CardPricePoint = {
  /**
   * The catalogue tcgId is from. An English and a Japanese card can share an id (neo4-106 is Shining
   * Celebi and Lucky Stadium), so a reading is matched to a card on both.
   */
  language: PriceLanguage;
  tcgId: string;
  /** ISO yyyy-mm-dd. */
  date: string;
  /** The normal printing, or null where the market published nothing. */
  market: number | null;
  /** The foil, or null where there is no separate foil price. */
  holo: number | null;
  /**
   * Every printing's figure that day, TCGplayer's names ("1st-edition-holofoil"), where the
   * reading was stored per printing (card_price_months, since 2026-09-13). Absent on a reading
   * from before, which knew only `market` and `holo`.
   */
  printings?: Record<string, number>;
  /**
   * The printings whose figure that day is an earlier one held over a stray sale, each with the
   * stray figure it stands in for (price-months.mjs holdLastFigure). Absent on a day with none.
   */
  held?: Record<string, number>;
  /**
   * Which market the reading is from, as card_prices.source stores it. Required on the way in:
   * the column defaults to 'cardmarket', so a point written without one was labelled with the
   * market it was not from (every nightly TCGplayer point, for the hours after 2026-09-12's
   * change). Absent on the way out, where nothing reads it yet.
   */
  source?: "tcgplayer" | "cardmarket";
};

/** One printing's figure on one day, on its way into card_price_months. Euros. */
export type PrintingDay = {
  /** The catalogue tcgId is from; required, because a row filed under a guess mixed two cards' lines. */
  language: PriceLanguage;
  tcgId: string;
  printing: string;
  date: string;
  price: number | null;
  source: NonNullable<CardPricePoint["source"]>;
};

/**
 * What one copy was worth on a reading: its own printing's figure where the reading has printings,
 * taken in the order today's price takes them (printingKeysOf: the run and the foil, then the run,
 * then the foil, then the plain card), so a 1st Edition copy reads the stamped run's history and
 * not the unlimited one's. A reading without printings has the two old series: the foil for a
 * reverse holo, the plain figure otherwise.
 */
export function priceOfCopy(
  copy: { finish?: string | null; edition?: string | null },
  point: CardPricePoint,
): number | null {
  if (point.printings) {
    for (const key of printingKeysOf(copy)) {
      const v = point.printings[key];
      if (v != null) return v;
    }
    // A reverse with no reverse figure that day is unpriced, not the plain card (copyPriceOf).
    return isReverseFinish(copy.finish) ? null : point.market;
  }
  /* A reading from before printings were stored (LEGACY in price-months.mjs) has one foil figure and
     cannot say which printing it was, so it reads as it always did. */
  return (isReverseFinish(copy.finish) ? point.holo : null) ?? point.market;
}

export type Mover = {
  card: OwnedCard;
  set: string;
  /** The code printed on the card's corner ("XYP"), where the catalogue has one: what a list shows beside the number. */
  setAbbr: string | null;
  /** What one copy was worth at the earliest reading in the window. */
  was: number;
  /** And at the latest. */
  now: number;
  /** now − was, per copy. */
  change: number;
  /** The same as a fraction of `was`. */
  pct: number;
  /**
   * How many copies the move is counted over: the copies held, or one for a wished card
   * (MoversOptions.wished), since a wish is one card wanted however many rows say it.
   */
  copies: number;
  /** change × copies, which is what it did to the collection's total. */
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
function held(card: OwnedCard, point: CardPricePoint, wished = false): number | null {
  let best: number | null = null;
  for (const v of card.variants) {
    if (v.owned === wished) continue;
    const each = priceOfCopy(v, point);
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
  /**
   * The wishlist: price each card's wished printings rather than the ones held, and count it
   * once, so `total` is the change. Without it a wished card holds no copies and never moves.
   */
  wished?: boolean;
};

/**
 * Each card's earliest and latest reading, and nothing between: all moversOf compares.
 *
 * The movers route caches this rather than the whole window. Every reading of sixteen hundred held
 * cards over thirty days is 7.5 MB, past the Data Cache's 2 MB an entry, so it was never cached and
 * Home read the lines again on every visit (production logs, 2026-09-15); two readings a card is a
 * few hundred KB whatever the period. Ties keep the reading moversOf would take from a stable sort:
 * the first of the earliest date, the last of the latest.
 */
export function endsOfLines(points: CardPricePoint[]): CardPricePoint[] {
  const ends = new Map<string, { first: CardPricePoint; last: CardPricePoint }>();
  for (const p of points) {
    const key = historyKey(p.language, p.tcgId);
    const end = ends.get(key);
    if (!end) {
      ends.set(key, { first: p, last: p });
      continue;
    }
    if (p.date < end.first.date) end.first = p;
    if (p.date >= end.last.date) end.last = p;
  }
  return [...ends.values()].flatMap(({ first, last }) =>
    first === last ? [first] : [first, last],
  );
}

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
  { top = 5, minChange = 0.1, wished = false }: MoversOptions = {},
): { up: Mover[]; down: Mover[] } {
  const byCard = new Map<string, CardPricePoint[]>();
  for (const p of points) {
    const key = historyKey(p.language, p.tcgId);
    if (!byCard.has(key)) byCard.set(key, []);
    byCard.get(key)!.push(p);
  }

  const movers: Mover[] = [];
  for (const set of sets) {
    for (const card of set.cards) {
      if (!card.tcgId) continue;
      const copies = wished ? (card.variants.some((v) => !v.owned) ? 1 : 0) : copiesHeld(card);
      if (!copies) continue;

      // Sorted here rather than trusted from the query: this is a pure
      // function and a caller that hands them over shuffled should still get
      // the right answer.
      const series = (byCard.get(historyKey(priceLanguageOf(set.language), card.tcgId)) ?? [])
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date));
      if (series.length < 2) continue;

      const first = series[0]!;
      const last = series.at(-1)!;
      const was = held(card, first, wished);
      const now = held(card, last, wished);
      if (was == null || now == null || was <= 0) continue;

      const change = now - was;
      if (Math.abs(change) < minChange) continue;

      movers.push({
        card,
        set: set.name,
        setAbbr: set.abbreviation ?? null,
        was,
        now,
        change,
        pct: change / was,
        copies,
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
