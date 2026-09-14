import type { CardItem } from "./items";
import { type CardPricePoint, priceOfCopy } from "./movers";
import { historyKey } from "../price-months.mjs";

/** What one copy's price did between two days, and what that did to the list: `total` is `change` times the copies. */
export type PriceChange = {
  /** One copy at its first reading on or after `from`, euros. */
  was: number;
  /** One copy at its last reading on or before `to`. */
  now: number;
  /** now − was. */
  change: number;
  /** change × the copies (a wish counts once, as everywhere a list is valued). */
  total: number;
  /** The days the two readings are from, which can sit inside the asked window where readings are weekly. */
  from: string;
  to: string;
};

/**
 * Each item's price change over a window, keyed by the item's id, for `GET /v1/cards?sort=change`.
 *
 * The same comparison as the movers (moversOf): a copy's earliest and latest reading inside the
 * window, each at the copy's own printing (priceOfCopy), so a reverse holo moves with the reverse
 * price and a 1st Edition with its own. An item with no card id, or with fewer than two readings
 * that price it, has no change and is absent from the map.
 */
export function priceChanges(
  items: CardItem[],
  points: CardPricePoint[],
  from: string,
  to: string,
): Map<string, PriceChange> {
  const byCard = new Map<string, CardPricePoint[]>();
  for (const p of points) {
    if (p.date < from || p.date > to) continue;
    // By catalogue and id: a Japanese card and an English one can share an id (neo4-106).
    const key = historyKey(p.language, p.tcgId);
    const list = byCard.get(key);
    if (list) list.push(p);
    else byCard.set(key, [p]);
  }
  for (const list of byCard.values()) list.sort((a, b) => a.date.localeCompare(b.date));

  const out = new Map<string, PriceChange>();
  for (const it of items) {
    const series = it.tcgId ? byCard.get(historyKey(it.catalogue, it.tcgId)) : undefined;
    if (!series) continue;
    let first: { price: number; date: string } | null = null;
    let last: { price: number; date: string } | null = null;
    for (const p of series) {
      const price = priceOfCopy(it, p);
      if (price == null) continue;
      if (!first) first = { price, date: p.date };
      last = { price, date: p.date };
    }
    if (!first || !last || first.date === last.date) continue;
    const change = Math.round((last.price - first.price) * 100) / 100;
    const copies = it.owned ? Math.max(0, it.quantity) : 1;
    out.set(it.id, {
      was: first.price,
      now: last.price,
      change,
      total: Math.round(change * copies * 100) / 100,
      from: first.date,
      to: last.date,
    });
  }
  return out;
}

/**
 * The items by what their price change did to the list: `desc` (the default) biggest gain first,
 * `asc` biggest loss first. An item without a change goes last either way, in the order it came.
 */
export function sortByChange(
  items: CardItem[],
  changes: Map<string, PriceChange>,
  order: "asc" | "desc" = "desc",
): CardItem[] {
  const dir = order === "asc" ? 1 : -1;
  return items
    .map((it, i) => ({ it, i, c: changes.get(it.id)?.total }))
    .sort((a, b) => {
      if (a.c === undefined && b.c === undefined) return a.i - b.i;
      if (a.c === undefined) return 1;
      if (b.c === undefined) return -1;
      return (a.c - b.c) * dir || a.i - b.i;
    })
    .map((x) => x.it);
}
