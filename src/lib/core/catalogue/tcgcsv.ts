import { catalogueTimeout, mapLimit } from "../util";

/**
 * TCGplayer's market figures for a whole shelf, as tcgcsv.com publishes them once a day.
 *
 * tcgcsv mirrors TCGplayer's own catalogue and prices, free and keyless, one file per set
 * ("group"). It is where the price history before 2026-08-16 already came from
 * (scripts/backfill-card-prices.mjs reads its daily archive), and since 2026-09-12 it is where
 * the weekly point for every card nobody holds comes from too, in place of Cardmarket's guide:
 * one market for every line, so a card's chart does not change markets halfway along.
 *
 * Two shelves: Pokémon (category 3) and Pokémon Japan (85). TCGplayer sells no Korean or
 * Chinese cards, so those have no weekly point.
 *
 * Measured 2026-09-12: 220 English groups and 459 Japanese, about 0.06 s a request, so both
 * shelves come in a few seconds at eight at a time, inside the cron's minute.
 */

export const TCGCSV_CATEGORY = { en: 3, ja: 85 } as const;

/** productId to (TCGplayer's subtype name, "Normal" or "Reverse Holofoil", to its market figure in dollars). */
export type ShelfPrices = Map<number, Map<string, number>>;

const BASE = "https://tcgcsv.com/tcgplayer";

async function read<T>(url: string): Promise<T> {
  // tcgcsv answers 401 to a request that does not say who is asking.
  const res = await fetch(url, {
    headers: { accept: "application/json", "User-Agent": "cardorb.com" },
    signal: catalogueTimeout(),
  });
  if (!res.ok) throw new Error(`tcgcsv ${url}: ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Every product's market figures on one shelf.
 *
 * Tolerant per group: a set whose file did not come back is left out, and its cards simply get
 * no point this week, which the chart draws as a gap. Throws only when no group answered at
 * all, so an outage is reported as a failed pass rather than written as a week of nothing.
 */
export async function shelfPrices(category: number): Promise<ShelfPrices> {
  const { results: groups } = await read<{ results: { groupId: number }[] }>(
    `${BASE}/${category}/groups`,
  );
  const out: ShelfPrices = new Map();
  let answered = 0;
  await mapLimit(groups, 8, async (g) => {
    let rows: { productId: number; subTypeName: string; marketPrice: number | null }[];
    try {
      ({ results: rows } = await read<{ results: typeof rows }>(
        `${BASE}/${category}/${g.groupId}/prices`,
      ));
    } catch {
      return;
    }
    answered++;
    for (const r of rows) {
      if (!(typeof r.marketPrice === "number" && r.marketPrice > 0)) continue;
      const printings = out.get(r.productId) ?? new Map<string, number>();
      printings.set(r.subTypeName, r.marketPrice);
      out.set(r.productId, printings);
    }
  });
  if (groups.length && !answered)
    throw new Error(`tcgcsv answered for none of category ${category}'s groups`);
  return out;
}

/**
 * One group's printings, in the shape TCGdex relays TCGplayer's figures in, keyed by product.
 *
 * For the cards TCGdex has no TCGplayer figure for at all: the subsets and promo lines
 * scripts/tcgplayer-links.mjs linked to a tcgcsv group. Shaped like TCGdex's `pricing.tcgplayer`
 * (printing name, marketPrice, lowPrice, productId) so the pickers in tcgdex-client.ts read it
 * with the same rules, and a promo priced here is chosen exactly as any other card is.
 */
export async function groupPrintings(
  groupId: number,
  category: number = TCGCSV_CATEGORY.en,
): Promise<
  Map<number, Record<string, { marketPrice: number; lowPrice: number | null; productId: number }>>
> {
  const { results } = await read<{
    results: {
      productId: number;
      subTypeName: string;
      marketPrice: number | null;
      lowPrice: number | null;
    }[];
  }>(`${BASE}/${category}/${groupId}/prices`);
  const out = new Map<
    number,
    Record<string, { marketPrice: number; lowPrice: number | null; productId: number }>
  >();
  for (const r of results) {
    if (!(typeof r.marketPrice === "number" && r.marketPrice > 0)) continue;
    const printings = out.get(r.productId) ?? {};
    // tcgcsv's "Reverse Holofoil" is TCGdex's "reverse-holofoil".
    printings[r.subTypeName.toLowerCase().replace(/\s+/g, "-")] = {
      marketPrice: r.marketPrice,
      lowPrice: typeof r.lowPrice === "number" ? r.lowPrice : null,
      productId: r.productId,
    };
    out.set(r.productId, printings);
  }
  return out;
}
