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
      const price = p ? ((it.finish === "reverse-holo" ? p.holo : null) ?? p.market) : null;
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
