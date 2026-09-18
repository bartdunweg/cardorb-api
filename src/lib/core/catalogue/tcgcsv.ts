import { shelfFigureOf } from "../price-basis.mjs";
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
 * Two shelves: Pokémon (category 3) and Pokémon Japan (85).
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
 * One printing of one product on a shelf, as tcgplayer_prices stores it. Dollars.
 *
 * `market` is TCGplayer's market figure. Where it has none (a card listed and never sold, since
 * 2026-09-18) the row carries `listing`, the lowest asking price, and `market` is null: never both.
 */
export type ShelfPrinting = {
  productId: number;
  printing: string;
  market: number | null;
  listing?: number | null;
};

/** A shelf row as tcgcsv publishes it: the figures this app reads. */
type TcgcsvPriceRow = {
  productId: number;
  subTypeName: string;
  marketPrice: number | null;
  lowPrice?: number | null;
};

/** tcgcsv's "Reverse Holofoil" is TCGdex's "reverse-holofoil": the names the pickers read. */
export const printingName = (subTypeName: string) => subTypeName.toLowerCase().replace(/\s+/g, "-");

/**
 * Every priced printing on one shelf, its market figure or its lowest listing where it has no
 * market figure (shelfFigureOf), for the table the collection reads.
 *
 * The same files shelfPrices() reads, kept whole. Tolerant per group like it, and it says how
 * many groups answered, so a cron can refuse to call a shelf with most of its sets missing a day.
 * shelfPrices(), which the price history reads, stays market figures only.
 */
export async function shelfPrintings(
  category: number,
): Promise<{ rows: ShelfPrinting[]; groups: number; answered: number }> {
  const { results: groups } = await read<{ results: { groupId: number }[] }>(
    `${BASE}/${category}/groups`,
  );
  const rows: ShelfPrinting[] = [];
  let answered = 0;
  await mapLimit(groups, 8, async (g) => {
    let results: TcgcsvPriceRow[];
    try {
      ({ results } = await read<{ results: typeof results }>(
        `${BASE}/${category}/${g.groupId}/prices`,
      ));
    } catch {
      return;
    }
    answered++;
    for (const r of results) {
      const figure = shelfFigureOf(r);
      if (!figure) continue;
      rows.push({ productId: r.productId, printing: printingName(r.subTypeName), ...figure });
    }
  });
  return { rows, groups: groups.length, answered };
}

/**
 * One group's printings, in the shape TCGdex relays TCGplayer's figures in, keyed by product.
 *
 * For the cards TCGdex has no TCGplayer figure for at all: the subsets and promo lines
 * scripts/tcgplayer-links.mjs linked to a tcgcsv group. Shaped like TCGdex's `pricing.tcgplayer`
 * (printing name, marketPrice, productId) so the pickers in tcgdex-client.ts read it
 * with the same rules, and a promo priced here is chosen exactly as any other card is.
 */
export async function groupPrintings(
  groupId: number,
  category: number = TCGCSV_CATEGORY.en,
): Promise<Map<number, Record<string, GroupPrinting>>> {
  const { results } = await read<{ results: TcgcsvPriceRow[] }>(
    `${BASE}/${category}/${groupId}/prices`,
  );
  const out = new Map<number, Record<string, GroupPrinting>>();
  for (const r of results) {
    const figure = shelfFigureOf(r);
    if (!figure) continue;
    const printings = out.get(r.productId) ?? {};
    printings[printingName(r.subTypeName)] = {
      marketPrice: figure.market,
      lowPrice: figure.listing,
      productId: r.productId,
    };
    out.set(r.productId, printings);
  }
  return out;
}

/** One printing of a group file, in TCGdex's shape: `lowPrice` only where `marketPrice` is null. */
export type GroupPrinting = {
  marketPrice: number | null;
  lowPrice: number | null;
  productId: number;
};

/** One product of a group as tcgcsv lists it: its name and TCGplayer's card facts beside it. */
export type GroupProduct = {
  productId: number;
  name: string;
  extendedData?: { name: string; value: string }[];
};

/** Every product of one group, cards and sealed product alike. */
export async function groupProducts(
  groupId: number,
  category: number = TCGCSV_CATEGORY.en,
): Promise<GroupProduct[]> {
  const { results } = await read<{ results: GroupProduct[] }>(
    `${BASE}/${category}/${groupId}/products`,
  );
  return results;
}
