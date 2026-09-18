import type { Printing } from "../catalogue/card-printings";
import type { UsdPrice } from "../catalogue/tcgdex-client";
import { isPatternedReverse } from "../price-basis.mjs";
import { finishPrintingKey, historyKey, patternPrintingKey } from "../price-months.mjs";
import type { PriceLanguage } from "../price-months.mjs";
import type { CardPricePoint } from "./movers";

/**
 * Which printing a set page's tile prices a card at: the one the card's sheet opens on.
 *
 * A tile carries one figure a card, and it was TCGplayer's first printing with a market in
 * TCGplayer's own order (usdOf: normal, holofoil, reverse-holofoil, then the runs). The sheet lists
 * the printings in this app's order (printingsOf, FINISHES: normal, reverse holo, holo, the ball
 * reverses) and opens on the first of them, so a holo rare that also came as a reverse opened on
 * "Reverse" under a tile that showed the holo's figure. One rule now: the first printing in the
 * sheet's order that TCGplayer prices, and the tile says which one it is.
 *
 * Print runs keep their old order: the unlimited run is read before the stamped one, over every
 * printing, so a Jungle holo is still priced at its unlimited holofoil and a card TCGplayer prices
 * only as a 1st Edition (Base Set Machamp) at that.
 */

/** The printing as the sheet's buttons key it: the finish, and its foil pattern after a slash. */
export const printingKeyOf = (p: Printing): string =>
  p.foilPattern ? `${p.finish}/${p.foilPattern}` : p.finish;

/** TCGplayer's foil word for a finish: what a printing's series name is built from. */
const foilOf = (finish: Printing["finish"]): string =>
  finish === "holo"
    ? "holofoil"
    : finish === "reverse-holo" || isPatternedReverse(finish)
      ? "reverse-holofoil"
      : "normal";

type Run = "unlimited" | "1st-edition";

/**
 * The names TCGplayer's figures for this printing are filed under, in one run, in the order one is
 * taken. Strict: a printing reads its own figure and never another printing's, which is the
 * difference with printingKeysOf in price-basis.mjs (a holo copy there falls back to the plain
 * card, because a copy has to be worth something; a tile has to name what it priced).
 *
 * A card sold in one run has its figure under the bare foil ("holofoil"); a card sold in two, under
 * the run and the foil ("unlimited-holofoil"), and its plain card under the run alone ("unlimited").
 * The names are the history's too (card_price_months), so the series that priced a tile is the line
 * its change is read from.
 */
export function seriesOf(p: Printing, run: Run): string[] {
  if (p.foilPattern)
    return run === "unlimited" ? [patternPrintingKey(p.foilPattern, foilOf(p.finish))] : [];
  if (isPatternedReverse(p.finish)) return run === "unlimited" ? [finishPrintingKey(p.finish)] : [];
  const foil = foilOf(p.finish);
  if (run === "unlimited")
    return foil === "normal" ? ["normal", "unlimited"] : [foil, `unlimited-${foil}`];
  return foil === "normal" ? ["1st-edition"] : [`1st-edition-${foil}`];
}

/** One card's headline: the printing, the series its figure is filed under, and the figure. */
export type Headline = { printing: string | null; series: string | null; usd: UsdPrice };

/** A TCGplayer printing name ("1st-edition-holofoil") as the finish it is a print of. */
const finishOfSeries = (series: string): Printing["finish"] => {
  const foil = series.replace(/^(1st-edition|unlimited|shadowless|blue-border)-?/, "");
  return foil === "holofoil" ? "holo" : foil === "reverse-holofoil" ? "reverse-holo" : "normal";
};

/**
 * The headline printing of one card, or null where TCGplayer prices none of it.
 *
 * `printings` in the sheet's order (printingsOf); `priced` every printing TCGplayer prices, by its
 * own name (usdPrintingsOf); `fallback` the figure the card had before this rule (usdOf), for a
 * card whose priced printing is none of the ones the catalogue lists. That keeps its price, and is
 * named by the finish its figure is filed under where the sheet lists that finish (or lists none,
 * so the sheet has no buttons to disagree with), and null where it lists others.
 */
export function headlinePrinting(
  printings: readonly Printing[],
  priced: Record<string, UsdPrice> | null | undefined,
  fallback: UsdPrice | null,
): Headline | null {
  /* A market figure first, in the sheet's order; where no printing has one, the first that is
     listed, at its lowest listing, as usdOf reads a card since #561. Without the second pass a
     card TCGplayer lists and has never sold lost its "From" figure on the set page. */
  const hasMarket = (usd: UsdPrice) => typeof usd.market === "number";
  const isListed = (usd: UsdPrice) => typeof usd.listing === "number" && usd.listing > 0;
  for (const takes of [hasMarket, isListed]) {
    for (const run of ["unlimited", "1st-edition"] as const) {
      for (const p of printings) {
        for (const series of seriesOf(p, run)) {
          const usd = priced?.[series];
          if (usd && takes(usd)) return { printing: printingKeyOf(p), series, usd };
        }
      }
    }
  }
  if (!fallback || (!hasMarket(fallback) && !isListed(fallback))) return null;
  const series =
    Object.entries(priced ?? {}).find(
      ([, v]) =>
        v.market === fallback.market &&
        (v.listing ?? null) === (fallback.listing ?? null) &&
        (v.productId ?? null) === (fallback.productId ?? null),
    )?.[0] ?? null;
  const finish = series ? finishOfSeries(series) : null;
  const listed =
    finish && (!printings.length || printings.some((p) => p.finish === finish && !p.foilPattern));
  return { printing: listed ? finish : null, series, usd: fallback };
}

/** What a card's headline printing did over a window: its first and last reading in it, euros. */
export type HeadlineChange = { was: number; now: number; change: number; from: string; to: string };

/**
 * Each card's headline change between `from` and `to`, keyed by the card's id.
 *
 * The comparison priceChanges() makes for a copy (the earliest and the latest reading inside the
 * window), made for the printing the tile shows: its own series and no other, so a tile priced at
 * the reverse moves with the reverse. A reading from before printings were stored has the two old
 * series only, the foil and the plain card, and is read by which of those the series is. A card
 * with fewer than two readings of its printing in the window is absent from the map.
 */
export function headlineChanges(
  cards: { id: string; tcgId: string; language: PriceLanguage; series: string }[],
  points: readonly CardPricePoint[],
  from: string,
  to: string,
): Map<string, HeadlineChange> {
  const byCard = new Map<string, CardPricePoint[]>();
  for (const p of points) {
    if (p.date < from || p.date > to) continue;
    const key = historyKey(p.language, p.tcgId);
    const list = byCard.get(key);
    if (list) list.push(p);
    else byCard.set(key, [p]);
  }
  const out = new Map<string, HeadlineChange>();
  for (const c of cards) {
    const series = byCard.get(historyKey(c.language, c.tcgId));
    if (!series) continue;
    const foil = c.series.includes("holofoil");
    let first: { price: number; date: string } | null = null;
    let last: { price: number; date: string } | null = null;
    for (const p of [...series].sort((a, b) => a.date.localeCompare(b.date))) {
      const price = p.printings ? p.printings[c.series] : foil ? p.holo : p.market;
      if (price == null) continue;
      if (!first) first = { price, date: p.date };
      last = { price, date: p.date };
    }
    if (!first || !last || first.date === last.date) continue;
    out.set(c.id, {
      was: first.price,
      now: last.price,
      change: Math.round((last.price - first.price) * 100) / 100,
      from: first.date,
      to: last.date,
    });
  }
  return out;
}

/** How far back a set page's `from` may reach: a year, the window the page's chart periods go to. */
export const FROM_MAX_DAYS = 365;

/**
 * A set page's `from`, checked: a real day (2026-02-30 is not one), not after `today` and not more
 * than FROM_MAX_DAYS before it. The day back where it is one, an error sentence where it is not.
 */
export function readFromDay(raw: string, today: string): { from: string } | { error: string } {
  const at = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? Date.parse(`${raw}T00:00:00Z`) : NaN;
  if (Number.isNaN(at) || new Date(at).toISOString().slice(0, 10) !== raw)
    return { error: "from must be a date, yyyy-mm-dd." };
  if (raw > today) return { error: "from must not be after today." };
  const earliest = new Date(Date.parse(`${today}T00:00:00Z`) - FROM_MAX_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (raw < earliest) return { error: "from must be within the past year." };
  return { from: raw };
}
