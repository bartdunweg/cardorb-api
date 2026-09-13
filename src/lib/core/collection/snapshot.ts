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
import type { ShelfPrices } from "../catalogue/tcgcsv";
import type { CardSet } from "./cards";
import type { ValueSnapshot } from "./value-snapshot";
import type { PrintingDay } from "./movers";
import { LEGACY, printingKey } from "../price-months.mjs";

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
 * Every card TCGplayer prices, on this day, for the lines under cards nobody holds.
 *
 * Read from one shelf's product ids against that shelf's figures from tcgcsv, converted at the
 * day's rate. Written weekly rather than nightly by the cron: some twenty-eight thousand cards a
 * night is gigabytes a year of readings about cards nobody is watching, and a chart over years
 * reads the same at one point a week. A card somebody holds is written nightly by
 * cardPricesFromSets() and takes precedence.
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
