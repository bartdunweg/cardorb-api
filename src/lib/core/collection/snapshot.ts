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
import { copyPriceOf, pointFromTcgplayer, shownPrice } from "../price-basis.mjs";
import type { ShelfPrices } from "../catalogue/tcgcsv";
import type { CardSet } from "./cards";
import type { ValueSnapshot } from "./value-snapshot";
import type { SourcedPricePoint } from "./movers";

/**
 * The reading off an assembled collection: the card's own blended price, the one
 * the tile and the sheet show, so the line ends where the number stands. Printing
 * by printing, through copyPriceOf(); a card with no price on it is unpriced.
 * The guide's date is not to hand here, so the caller dates it.
 */
export function snapshotFromSets(sets: CardSet[], date: string): ValueSnapshot {
  let value = 0;
  let copies = 0;
  let priced = 0;
  let unpriced = 0;
  for (const set of sets) {
    for (const card of set.cards) {
      const held = copiesHeld(card);
      if (!held) continue;
      copies += held;
      let any = false;
      for (const v of card.variants) {
        if (!v.owned) continue;
        const each = shownPrice(copyPriceOf(v, card));
        if (each == null) continue;
        value += each * Math.max(0, v.quantity ?? 0);
        any = true;
      }
      if (any) priced++;
      else unpriced++;
    }
  }
  return { date, value, cards: copies, priced, unpriced };
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
): SourcedPricePoint[] {
  const euros = (usd: number | null) =>
    usd == null ? null : Math.round(usd * usdToEur * 100) / 100;
  const out: SourcedPricePoint[] = [];
  for (const [tcgId, productId] of Object.entries(products)) {
    if (productId == null) continue;
    const point = pointFromTcgplayer(shelf.get(productId));
    if (!point) continue;
    out.push({
      tcgId,
      date,
      market: euros(point.market),
      holo: euros(point.holo),
      source: "tcgplayer",
    });
  }
  return out;
}

/**
 * Every held card's own price on this day, for the movers and the lines. Deduped on tcgId.
 *
 * Both series are TCGplayer's since 2026-09-12; see the note inside for which printing each
 * reads. The holo series used to be Cardmarket's `-holo` fields.
 */
export function cardPricesFromSets(sets: CardSet[], date: string): SourcedPricePoint[] {
  const seen = new Map<string, SourcedPricePoint>();
  for (const set of sets) {
    for (const card of set.cards) {
      if (!card.tcgId || seen.has(card.tcgId) || !copiesHeld(card)) continue;
      /*
       * The same market the card itself shows, or the line disagrees with the figure above it.
       *
       * A point is two series, the ordinary printing and the foil, because that is what the
       * chart draws. TCGplayer names more printings than two, so each series takes the first of
       * theirs that means it: the ordinary run before the plain card, the foil before the
       * reverse. Then the card's own figure for the plain series, which is TCGplayer's too since
       * 2026-09-12. No Cardmarket fallback for either: a card TCGplayer does not price has no
       * point, the same "no price" the card shows.
       *
       * The catalogue-wide weekly pass (cardPricesFromGuide) is still Cardmarket's until it reads
       * tcgcsv's archive. A card somebody holds is written nightly by this function and takes
       * precedence.
       */
      const printing = (...names: string[]) => {
        for (const name of names) {
          const found = card.pricePrintings?.[name];
          if (found) return shownPrice(found);
        }
        return null;
      };
      const market = printing("normal", "unlimited", "1st-edition") ?? shownPrice(card.price);
      const holo = printing(
        "holofoil",
        "unlimited-holofoil",
        "reverse-holofoil",
        "1st-edition-holofoil",
      );
      if (market == null && holo == null) continue;
      seen.set(card.tcgId, { tcgId: card.tcgId, date, market, holo, source: "tcgplayer" });
    }
  }
  return [...seen.values()];
}
