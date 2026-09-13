import { isReverseFinish } from "./collection-row";
import type { CardItem } from "./items";
import type { CardPricePoint } from "./movers";
import type { ValueSnapshot } from "./value-snapshot";

/**
 * What a list of copies has been worth, day by day, from the per-card readings.
 *
 * The nightly snapshot table holds the whole collection and nothing smaller, so a
 * folder's line is built here instead: for every day a reading exists, each owned
 * copy at that day's price for its printing (the foil for a reverse holo, the plain
 * price otherwise — copyPrice()'s rule), `quantity` times. A copy with no reading
 * that day counts as unpriced, the same convention as sumValue(). Whole euros, like
 * the snapshots, so the two series read the same on one chart.
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
  const byDate = new Map<string, Map<string, CardPricePoint>>();
  for (const p of prices) {
    let day = byDate.get(p.date);
    if (!day) byDate.set(p.date, (day = new Map()));
    day.set(p.tcgId, p);
  }
  // The wishlist: a wish counts once, as sumValue() counts it, whatever its quantity.
  const owned = items.filter((it) => it.owned === (list === "owned"));
  return [...byDate.keys()].sort().map((date) => {
    const day = byDate.get(date)!;
    let value = 0;
    let cards = 0;
    let priced = 0;
    let unpriced = 0;
    for (const it of owned) {
      const n = list === "owned" ? Math.max(0, it.quantity) : 1;
      const p = it.tcgId ? day.get(it.tcgId) : undefined;
      const price = p ? ((isReverseFinish(it.finish) ? p.holo : null) ?? p.market) : null;
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

/** How long a card's last reading stands in for a day without one: two weekly readings' gap. */
export const CARRY_DAYS = 14;

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

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
  const last = new Map<string, CardPricePoint>();
  let previous: string | null = null;
  return [...byDate.keys()].sort().flatMap((date) => {
    for (const p of byDate.get(date)!) if (p.market != null || p.holo != null) last.set(p.tcgId, p);
    const held = owned.filter((it) => !it.acquiredAt || it.acquiredAt.slice(0, 10) <= date);
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
      ? held.filter((it) => it.acquiredAt && it.acquiredAt.slice(0, 10) > since)
      : [];
    const gained = fresh.length ? pointOn(date, fresh, standing) : null;
    return [{ ...point, added: gained?.cards ?? 0, addedValue: gained?.value ?? 0 }];
  });
}
