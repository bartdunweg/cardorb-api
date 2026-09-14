import type { CardItem } from "./items";
import { type CardPricePoint, priceOfCopy } from "./movers";
import type { ValueSnapshot } from "./value-snapshot";

/** How long a card's last reading stands in for a day without one: two weekly readings' gap. */
export const CARRY_DAYS = 14;

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** A reading with no figure in it is no reading. */
const hasFigure = (p: CardPricePoint) => p.market != null || p.holo != null;

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
    const kept = it.tcgId ? recent.get(it.tcgId) : undefined;
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
      const kept = recent.get(p.tcgId) ?? [];
      while (kept.length && daysBetween(kept[0]!.date, date) > CARRY_DAYS) kept.shift();
      kept.push(p);
      recent.set(p.tcgId, kept);
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
    return { date, value: Math.round(value), cards, priced, unpriced };
  });
}

/**
 * One day's point for these copies. folderSeries answers a point only for a day it has a reading
 * for; a day with nothing standing still gets one, with every copy unpriced.
 */
const pointOn = (date: string, items: CardItem[], standing: CardPricePoint[]): ValueSnapshot =>
  folderSeries(items, standing)[0] ??
  folderSeries(items, [{ tcgId: "", date, market: null, holo: null }])[0]!;

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
    const known = firstPriced.get(p.tcgId);
    if (!known || p.date < known) firstPriced.set(p.tcgId, p.date);
  }
  const countsFrom = (it: CardItem): string | null => {
    const added = it.acquiredAt ? it.acquiredAt.slice(0, 10) : null;
    const priced = it.tcgId ? firstPriced.get(it.tcgId) : undefined;
    if (!priced) return added;
    return added && added > priced ? added : priced;
  };
  const last = new Map<string, CardPricePoint>();
  let previous: string | null = null;
  return [...byDate.keys()].sort().flatMap((date) => {
    for (const p of byDate.get(date)!) if (hasFigure(p)) last.set(p.tcgId, p);
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
