/**
 * What a collection is worth on a day, and what each card it holds traded at.
 *
 * Pure functions over an assembled collection, so the nightly cron and its tests read the same
 * arithmetic. Every figure here is TCGplayer's since 2026-09-12, the same market every screen
 * shows (see price-basis.mjs): the value point off the card's own price, the card points off
 * TCGplayer's printings, and the weekly point for every card nobody holds off tcgcsv.
 *
 * Cardmarket's guide used to price all three. The functions that read it (snapshotOf,
 * cardPricesOf, cardPricesFromGuide) are gone with it, and since the set page and search moved
 * too the guide is not read anywhere.
 */

import { copiesHeld } from "./cards-stats";
import { copyPriceOf, shownPrice } from "../price-basis.mjs";
import type { ShelfPrices, ShelfPrinting } from "../catalogue/tcgcsv";
import type { CardSet } from "./cards";
import type { ValueSnapshot } from "./value-snapshot";
import type { PrintingDay } from "./movers";
import { LEGACY, finishPrintingKey, printingKey, shadowlessKey } from "../price-months.mjs";

/**
 * The reading off an assembled collection: the card's own blended price, the one
 * the tile and the sheet show, so the line ends where the number stands. Printing
 * by printing, through copyPriceOf(); a card with no price on it is unpriced.
 * The guide's date is not to hand here, so the caller dates it.
 */
export function snapshotFromSets(
  sets: CardSet[],
  date: string,
  /** The date of the point before, for `added`; null where there is none. */
  since: string | null = null,
): ValueSnapshot {
  let value = 0;
  let copies = 0;
  let priced = 0;
  let unpriced = 0;
  let added = 0;
  let addedValue = 0;
  for (const set of sets) {
    for (const card of set.cards) {
      const held = copiesHeld(card);
      if (!held) continue;
      copies += held;
      let any = false;
      for (const v of card.variants) {
        if (!v.owned) continue;
        const each = shownPrice(copyPriceOf(v, card));
        const day = v.acquiredAt?.slice(0, 10);
        const isNew = since != null && day != null && day > since && day <= date;
        if (isNew) added += Math.max(0, v.quantity ?? 0);
        if (each == null) continue;
        value += each * Math.max(0, v.quantity ?? 0);
        if (isNew) addedValue += each * Math.max(0, v.quantity ?? 0);
        any = true;
      }
      if (any) priced++;
      else unpriced++;
    }
  }
  return { date, value, cards: copies, priced, unpriced, added, addedValue };
}

/**
 * Every card TCGplayer prices, on this day, for the line under every card.
 *
 * Read from one shelf's product ids against that shelf's figures from tcgcsv, converted at the
 * day's rate. Since 2026-09-14 the tcgplayer-prices cron writes these for every linked card, held
 * or not, from the same files it writes tcgplayer_prices from (cardPricesFromShelf).
 *
 * Until 2026-09-12 this read Cardmarket's guide, so a card nobody held had a line in one market
 * and the card itself showed another.
 *
 * @param products tcgId to TCGplayer productId, as tcgplayer-ids.generated.json has it
 * @param usdToEur euros per dollar on this day
 */
export function cardPricesFromTcgcsv(
  products: Record<string, number | null | undefined>,
  shelf: ShelfPrices,
  usdToEur: number,
  date: string,
): PrintingDay[] {
  const out: PrintingDay[] = [];
  for (const [tcgId, productId] of Object.entries(products)) {
    if (productId == null) continue;
    // Every printing TCGplayer prices, under its own name, since 2026-09-13: a card's history is
    // its printings', so a 1st Edition copy has the stamped run's line and not the unlimited one's.
    for (const [subType, usd] of shelf.get(productId) ?? []) {
      if (!(usd > 0)) continue;
      out.push({
        tcgId,
        printing: printingKey(subType),
        date,
        price: Math.round(usd * usdToEur * 100) / 100,
        source: "tcgplayer",
      });
    }
  }
  return out;
}

/** A card's TCGplayer link as tcgplayer-ids.generated.json has it: the product, and Base Set's Shadowless run. */
export type TcgplayerLink = { productId: number; shadowless?: { productId: number } } | null;

/**
 * One tcgcsv shelf, as the tcgplayer-prices cron reads it, as every linked card's points on this day.
 *
 * Every printing of the card's own product (cardPricesFromTcgcsv), then its Shadowless run's where
 * tcgplayer-links.mjs linked one: TCGplayer files Base Set's Shadowless run as a product of its own,
 * whose "Unlimited" is the Shadowless run and "1st Edition" the stamped one, so its printings are
 * renamed by shadowlessKey() ("unlimited-holofoil" to "shadowless-holofoil", "normal" to
 * "shadowless", "1st-edition-holofoil" kept). The same keys and order scripts/backfill-card-prices.mjs
 * writes, so a Shadowless or 1st Edition Base Set copy keeps its own line. On a clash the card's own
 * product stands and the run's figure is dropped, as the collection prices it (collection.ts, "TCGdex's
 * names win a clash"): Machamp is filed in Deck Exclusives with a 1st Edition of its own ($27.42 on
 * 2026-09-14) beside its Shadowless group's 1st Edition ($88.13), and the history carried the second
 * while the sheet showed the first, a 68 percent drop that never happened.
 *
 * Then the card's Poké Ball, Master Ball and Energy Symbol reverses, where `finishPrints` names them
 * (card-printings.ts finishPrintsFor): each a product of its own, written under the card as
 * `${finish}-reverse-holofoil` (finishPrintingKey), whatever subtype TCGplayer files its figure under.
 * The same key scripts/backfill-card-prices.mjs writes their past under.
 */
export function cardPricesFromShelf(
  links: Record<string, TcgplayerLink | undefined>,
  rows: ShelfPrinting[],
  usdToEur: number,
  date: string,
  finishPrints: Record<
    string,
    readonly { finish: string; productId: number; printing: string }[]
  > = {},
): PrintingDay[] {
  const shelf: ShelfPrices = new Map();
  for (const r of rows) {
    const printings = shelf.get(r.productId) ?? new Map<string, number>();
    printings.set(r.printing, r.market);
    shelf.set(r.productId, printings);
  }
  const products: Record<string, number | null> = {};
  const runs: Record<string, number | null> = {};
  for (const [id, link] of Object.entries(links)) {
    products[id] = link?.productId ?? null;
    if (link?.shadowless) runs[id] = link.shadowless.productId;
  }
  const points = cardPricesFromTcgcsv(products, shelf, usdToEur, date);
  const own = new Set(points.map((p) => `${p.tcgId}\u0001${p.printing}`));
  for (const p of cardPricesFromTcgcsv(runs, shelf, usdToEur, date)) {
    const printing = shadowlessKey(p.printing);
    if (!own.has(`${p.tcgId}\u0001${printing}`)) points.push({ ...p, printing });
  }
  for (const [tcgId, prints] of Object.entries(finishPrints)) {
    if (links[tcgId]?.productId == null) continue;
    for (const print of prints) {
      const printings = shelf.get(print.productId);
      const usd = printings?.get(print.printing) ?? [...(printings?.values() ?? [])][0];
      if (usd == null || !(usd > 0)) continue;
      points.push({
        tcgId,
        printing: finishPrintingKey(print.finish),
        date,
        price: Math.round(usd * usdToEur * 100) / 100,
        source: "tcgplayer",
      });
    }
  }
  return points;
}

/**
 * The points only for cards with no TCGplayer product: the snapshot's share since 2026-09-14.
 *
 * A linked card is written by the tcgplayer-prices cron straight from tcgcsv. Writing it again from
 * the assembled collection is the loop that could store an old price as a new day's (a figure the
 * collection still carried from a stored row), so the collection writes only what the source cannot.
 */
export const unlinkedCardPrices = (
  points: PrintingDay[],
  links: Record<string, TcgplayerLink | undefined>,
): PrintingDay[] => points.filter((p) => links[p.tcgId]?.productId == null);

/**
 * Every held card's own price on this day, for the movers and the lines. Deduped on tcgId.
 *
 * Both series are TCGplayer's since 2026-09-12; see the note inside for which printing each
 * reads. The holo series used to be Cardmarket's `-holo` fields.
 */
export function cardPricesFromSets(sets: CardSet[], date: string): PrintingDay[] {
  const seen = new Map<string, PrintingDay[]>();
  for (const set of sets) {
    for (const card of set.cards) {
      if (!card.tcgId || seen.has(card.tcgId) || !copiesHeld(card)) continue;
      /*
       * The same market the card itself shows, printing by printing, or a line disagrees with the
       * figure above it. Every printing the card carries (TCGplayer's, the Shadowless run's where
       * it is linked) is its own series since 2026-09-13. A card priced on no printing but with a
       * figure of its own keeps that figure as the old plain series, so it still has a point.
       */
      const days: PrintingDay[] = [];
      for (const [printing, price] of Object.entries(card.pricePrintings ?? {})) {
        const each = price ? shownPrice(price) : null;
        if (each != null)
          days.push({ tcgId: card.tcgId, printing, date, price: each, source: "tcgplayer" });
      }
      if (!days.length) {
        const own = shownPrice(card.price);
        if (own != null)
          days.push({
            tcgId: card.tcgId,
            printing: LEGACY.market,
            date,
            price: own,
            source: "tcgplayer",
          });
      }
      if (days.length) seen.set(card.tcgId, days);
    }
  }
  return [...seen.values()].flat();
}
