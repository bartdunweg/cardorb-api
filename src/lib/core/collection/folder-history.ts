import type { CardItem } from "./items";
import { type CardPricePoint, priceOfCopy } from "./movers";
import { historyKey } from "../price-months.mjs";
import type { ValueSnapshot } from "./value-snapshot";

/** How long a card's last reading stands in for a day without one: two weekly readings' gap. */
export const CARRY_DAYS = 14;

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** A reading with no figure in it is no reading. */
const hasFigure = (p: CardPricePoint) => p.market != null || p.holo != null;

/** A reading's card: its catalogue and its id, since the two catalogues share ids. */
const cardOf = (p: CardPricePoint) => historyKey(p.language, p.tcgId);
/** A copy's card, the same way; null for a copy with no catalogue id. */
const cardOfItem = (it: CardItem) => (it.tcgId ? historyKey(it.catalogue, it.tcgId) : null);

/**
 * What a list of copies has been worth, day by day, from the per-card readings.
 *
 * The nightly snapshot table holds the whole collection and nothing smaller, so a
 * folder's line is built here instead: for every day a reading exists, each owned
 * copy at that day's price for its printing (the foil for a reverse holo, the plain
 * price otherwise: copyPrice()'s rule), `quantity` times. Whole euros, like the
 * snapshots, so the two series read the same on one chart.
 *
 * A card with no reading on a day is valued at its last one, up to CARRY_DAYS old, as the Home
 * line is (holdingsSeries); a copy with none that recent counts as unpriced, the same convention
 * as sumValue(). Priced on the day alone, Kanto's line fell from EUR 19,750 to 16,200 on
 * 2026-09-13 and was back at 19,794 the next day: 184 held promos and gallery cards had no
 * reading that one day, and 36 of Kanto's copies were among them (Bart, 2026-09-14).
 *
 * `list` "wishlist" values the wishes instead: what the cards you lack would cost.
 * Membership is today's: a card filed into the folder last week is on the line
 * from the first reading, at what it was worth then. That is what a person asking
 * "what has this folder been worth" means; the alternative, no line at all, is
 * what they had.
 */
export function folderSeries(
  items: CardItem[],
  prices: CardPricePoint[],
  list: "owned" | "wishlist" = "owned",
): ValueSnapshot[] {
  return seriesDays(items, prices, list).map((p) => ({ ...p, value: Math.round(p.value) }));
}

/** folderSeries before its euros are rounded, so parts of one collection can be added up exactly. */
function seriesDays(
  items: CardItem[],
  prices: CardPricePoint[],
  list: "owned" | "wishlist",
): ValueSnapshot[] {
  const byDate = new Map<string, CardPricePoint[]>();
  for (const p of prices) {
    const day = byDate.get(p.date);
    if (day) day.push(p);
    else byDate.set(p.date, [p]);
  }
  // The wishlist: a wish counts once, as sumValue() counts it, whatever its quantity.
  const owned = items.filter((it) => it.owned === (list === "owned"));
  // Each card's readings of the last CARRY_DAYS, oldest first.
  const recent = new Map<string, CardPricePoint[]>();
  /** The copy at its newest reading that prices it, no older than CARRY_DAYS. */
  const priceOn = (it: CardItem, date: string): number | null => {
    const card = cardOfItem(it);
    const kept = card ? recent.get(card) : undefined;
    for (let i = (kept?.length ?? 0) - 1; i >= 0; i--) {
      const p = kept![i]!;
      if (daysBetween(p.date, date) > CARRY_DAYS) break;
      const price = priceOfCopy(it, p);
      if (price != null) return price;
    }
    return null;
  };
  return [...byDate.keys()].sort().map((date) => {
    for (const p of byDate.get(date)!) {
      if (!hasFigure(p) && !Object.keys(p.printings ?? {}).length) continue;
      const kept = recent.get(cardOf(p)) ?? [];
      while (kept.length && daysBetween(kept[0]!.date, date) > CARRY_DAYS) kept.shift();
      kept.push(p);
      recent.set(cardOf(p), kept);
    }
    let value = 0;
    let cards = 0;
    let priced = 0;
    let unpriced = 0;
    for (const it of owned) {
      const n = list === "owned" ? Math.max(0, it.quantity) : 1;
      const price = priceOn(it, date);
      cards += n;
      if (price == null) unpriced += n;
      else {
        priced += n;
        value += price * n;
      }
    }
    return { date, value, cards, priced, unpriced };
  });
}

/**
 * One day's point for these copies. folderSeries answers a point only for a day it has a reading
 * for; a day with nothing standing still gets one, with every copy unpriced.
 */
const pointOn = (date: string, items: CardItem[], standing: CardPricePoint[]): ValueSnapshot =>
  folderSeries(items, standing)[0] ??
  folderSeries(items, [{ language: "en", tcgId: "", date, market: null, holo: null }])[0]!;

/**
 * What the collection held on each day a reading exists, at that day's prices: the Home line.
 *
 * The same pricing as folderSeries (the foil for a reverse holo, the plain price otherwise,
 * `quantity` times), with one difference that is the whole point: a copy counts only from the day
 * it was added. Adding ten cards steps the line up, because the collection then holds ten more
 * cards (Bart, 2026-09-12). A copy with no recorded date counts as held all along, and days on
 * which nothing was held yet are left out rather than drawn as zero.
 *
 * A card with no reading on a day is valued at its last one, up to CARRY_DAYS old. The readings
 * are not the same set every day: every card has one on Saturdays, only the cards held when the
 * nightly series began have one on the other days, and on 2026-08-16 TCGplayer's archive had no
 * figure at all. Priced on the day alone, the line on 2026-09-13 jumped between EUR 40,000 on a
 * Saturday and EUR 28,000 on a Tuesday (250 cards unpriced) and dropped to zero on 08-16, none of
 * which the collection did. A reading with no figure in it is no reading.
 */
export function holdingsSeries(items: CardItem[], prices: CardPricePoint[]): ValueSnapshot[] {
  const owned = items.filter((it) => it.owned);
  const byDate = new Map<string, CardPricePoint[]>();
  for (const p of prices) {
    const day = byDate.get(p.date);
    // Pushed, not spread: a collection over two and a half years is a quarter of a million
    // readings, and copying the day's list per reading is quadratic in it.
    if (day) day.push(p);
    else byDate.set(p.date, [p]);
  }
  /*
   * A copy counts from the day it was added, or from its card's first reading where that is later
   * (Bart, 2026-09-13). A card added before it had a price, a pre-order or a set bought on release
   * day, drew as a copy "without a price" for days or weeks: Journey Together from 6 February to its
   * release on 28 March. It was worth nothing to the line either way; now it joins the line, and
   * its ring, on the day it is worth something. A card with no reading at all counts from the day
   * it was added and stays unpriced, so a card TCGplayer never prices does not vanish unsaid.
   */
  const firstPriced = new Map<string, string>();
  for (const p of prices) {
    if (!hasFigure(p)) continue;
    const known = firstPriced.get(cardOf(p));
    if (!known || p.date < known) firstPriced.set(cardOf(p), p.date);
  }
  const countsFrom = (it: CardItem): string | null => {
    const added = it.acquiredAt ? it.acquiredAt.slice(0, 10) : null;
    const card = cardOfItem(it);
    const priced = card ? firstPriced.get(card) : undefined;
    if (!priced) return added;
    return added && added > priced ? added : priced;
  };
  const last = new Map<string, CardPricePoint>();
  let previous: string | null = null;
  return [...byDate.keys()].sort().flatMap((date) => {
    for (const p of byDate.get(date)!) if (hasFigure(p)) last.set(cardOf(p), p);
    const held = owned.filter((it) => {
      const from = countsFrom(it);
      return from == null || from <= date;
    });
    if (!held.length) return [];
    const standing: CardPricePoint[] = [];
    for (const p of last.values()) {
      if (daysBetween(p.date, date) <= CARRY_DAYS) standing.push({ ...p, date });
    }
    const point = pointOn(date, held, standing);
    // What the line gained by holding more: the copies added since the point before, at this
    // day's price. The first point has no point before, and its copies were not added since one.
    const since = previous;
    previous = date;
    const fresh = since
      ? held.filter((it) => {
          const from = countsFrom(it);
          return from != null && from > since;
        })
      : [];
    const gained = fresh.length ? pointOn(date, fresh, standing) : null;
    return [{ ...point, added: gained?.cards ?? 0, addedValue: gained?.value ?? 0 }];
  });
}

/**
 * The Home line: the stored points before `recent` begins, then `recent`.
 *
 * A collection's value is its cards' prices added up, day by day (Bart, 2026-09-15). The stored
 * points after the one-time rebuild were written by the 04:00 snapshot from the collection as
 * assembled then, at that moment's rate, under the night's date: a day behind the cards' lines and
 * a few cents off, so an account holding one Pikachu with Grey Felt Hat saw a flat line on Home
 * while the card's own line moved (€932.00, €931.93, €931.54, €931.54 against €932, €928, €933,
 * €933). The recent days are holdingsSeries over the same readings every card's line reads.
 */
export function joinHistory(stored: ValueSnapshot[], recent: ValueSnapshot[]): ValueSnapshot[] {
  if (!recent.length) return stored;
  const from = recent[0]!.date;
  return [...stored.filter((p) => p.date < from), ...recent];
}

/** What part of the held copies was worth on each day: unrounded euros, and how many copies priced. */
export type DayTotals = Map<string, { value: number; priced: number }>;

const nextDay = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * What these copies were worth on every day from `from` up to (not including) `until`, at that
 * day's prices: folderSeries' pricing, every copy on every day whenever it was added.
 *
 * The part of the Home line before an account's first stored point (earlyLine). Worked out for one
 * chunk of the collection at a time, so a collection of two thousand cards over nineteen months is
 * never a million readings in memory at once: each chunk is summed and its readings let go. A copy
 * is priced by its own card's readings alone, so the chunks add up to what the whole would. Every
 * calendar day is asked, not only the days this chunk has a reading on, because a card with no
 * reading on a day stands at its last one (CARRY_DAYS) and another chunk may have one that day.
 */
export function dayTotals(
  items: CardItem[],
  prices: CardPricePoint[],
  from: string,
  until: string,
): DayTotals {
  const days: CardPricePoint[] = [];
  // A reading with no figure and no printings prices nothing: it only makes folderSeries ask the day.
  for (let day = from; day < until; day = nextDay(day))
    days.push({ language: "en", tcgId: "", date: day, market: null, holo: null });
  const out: DayTotals = new Map();
  for (const p of seriesDays(
    items.filter((it) => it.owned),
    [...prices.filter((p) => p.date >= from && p.date < until), ...days],
    "owned",
  ))
    out.set(p.date, { value: p.value, priced: p.priced });
  return out;
}

/**
 * The Home line before an account's first stored point, from what the account holds now.
 *
 * `parts` are dayTotals over chunks of the held copies, `cards` how many copies are held in all,
 * the copies with no catalogue id among them (they are in no chunk, and count as unpriced as they
 * do everywhere). Every copy counts on every day, also before it was added (Bart, 2026-09-19: the
 * price history of your cards, also before you added them), so this is what today's collection was
 * worth then, not what the account held then. A day on which no copy has a price, a reading that
 * day or one standing from the fourteen before, is left out rather than drawn as zero: before a
 * set was released, or before the readings begin.
 */
export function earlyLine(parts: DayTotals[], cards: number): ValueSnapshot[] {
  const sum = new Map<string, { value: number; priced: number }>();
  for (const part of parts)
    for (const [date, t] of part) {
      const day = sum.get(date);
      if (day) {
        day.value += t.value;
        day.priced += t.priced;
      } else sum.set(date, { ...t });
    }
  return [...sum.keys()].sort().flatMap((date) => {
    const { value, priced } = sum.get(date)!;
    if (!priced) return [];
    return [{ date, value: Math.round(value), cards, priced, unpriced: cards - priced }];
  });
}

/**
 * `early` before the stored points, then the stored points: a stored point wins every day it covers,
 * and the early line ends the day before the first of them. With nothing stored, `early` alone.
 */
export function prependHistory(early: ValueSnapshot[], stored: ValueSnapshot[]): ValueSnapshot[] {
  if (!early.length) return stored;
  if (!stored.length) return early;
  const first = stored[0]!.date;
  return [...early.filter((p) => p.date < first), ...stored];
}
