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
 * What the collection held on each day a reading exists, at that day's prices: the Home line.
 *
 * The same pricing as folderSeries (the foil for a reverse holo, the plain price otherwise,
 * `quantity` times), with one difference that is the whole point: a copy counts only from the day
 * it was added. Adding ten cards steps the line up, because the collection then holds ten more
 * cards (Bart, 2026-09-12). A copy with no recorded date counts as held all along, and days on
 * which nothing was held yet are left out rather than drawn as zero.
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
  return [...byDate.keys()].sort().flatMap((date) => {
    const held = owned.filter((it) => !it.acquiredAt || it.acquiredAt.slice(0, 10) <= date);
    // folderSeries prices the held copies against this one day's readings, and answers exactly
    // one point for it: the day is in the readings by construction.
    return held.length ? folderSeries(held, byDate.get(date)!) : [];
  });
}
