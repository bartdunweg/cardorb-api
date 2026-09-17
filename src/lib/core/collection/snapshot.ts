/**
 * What each card a collection holds traded at, for the nightly cron.
 *
 * Pure functions over an assembled collection, so the nightly cron and its tests read the same
 * arithmetic. Every figure here is TCGplayer's since 2026-09-12, the same market every screen
 * shows (see price-basis.mjs): the card points off TCGplayer's printings, and the weekly point for
 * every card nobody holds off tcgcsv. The collection's own value point is summed from those
 * readings since 2026-09-17 (value-history.ts, nightlyPoints).
 *
 * Cardmarket's guide used to price all three. The functions that read it (snapshotOf,
 * cardPricesOf, cardPricesFromGuide) are gone with it, and since the set page and search moved
 * too the guide is not read anywhere.
 */

import { copiesHeld } from "./cards-stats";
import { shownPrice } from "../price-basis.mjs";
import type { ShelfPrices, ShelfPrinting } from "../catalogue/tcgcsv";
import type { CardSet } from "./cards";
import type { PrintingDay } from "./movers";
import {
  LEGACY,
  type PriceLanguage,
  historyKey,
  priceLanguageOf,
  patternPrintingKey,
  printProductKey,
  printingKey,
  runKey,
  runLinksOf,
} from "../price-months.mjs";

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
 * @param language the catalogue the ids are from: the English shelf's cards are English ids, the
 *   Japanese shelf's Japanese ones
 * @param products tcgId to TCGplayer productId, as tcgplayer-ids.generated.json has it
 * @param usdToEur euros per dollar on this day
 */
export function cardPricesFromTcgcsv(
  language: PriceLanguage,
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
        language,
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
export type TcgplayerLink = {
  productId: number;
  shadowless?: { productId: number };
  /** My First Battle's Blue Border print, a product of its own. */
  blueBorder?: { productId: number };
} | null;

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
 * `${finish}-reverse-holofoil` (printProductKey), whatever subtype TCGplayer files its figure under.
 * A Japanese card's are read from card_print_pictures, its mirror holo among them, written as the
 * card's "reverse-holofoil".
 * The same key scripts/backfill-card-prices.mjs writes their past under.
 *
 * Then its foil pattern prints, where `patternPrints` names them (card-printings.ts patternPrintsFor):
 * a cosmos or cracked ice holo, each a product of its own, written as "cosmos-holofoil"
 * (patternPrintingKey). Their price was shown and never kept, so a pattern pressed on the sheet had
 * no line (Bart, 2026-09-15); `--pattern-prints` in the backfill writes their past.
 *
 * `language` is the catalogue the links' ids are from, and every point carries it: an English and a
 * Japanese card can share an id (neo4-106), and each is its own line.
 */
export function cardPricesFromShelf(
  language: PriceLanguage,
  links: Record<string, TcgplayerLink | undefined>,
  rows: ShelfPrinting[],
  usdToEur: number,
  date: string,
  finishPrints: Record<
    string,
    readonly { finish: string; productId: number; printing: string }[]
  > = {},
  patternPrints: Record<
    string,
    readonly { foilPattern: string; productId: number; printing: string }[]
  > = {},
): PrintingDay[] {
  const shelf: ShelfPrices = new Map();
  for (const r of rows) {
    const printings = shelf.get(r.productId) ?? new Map<string, number>();
    printings.set(r.printing, r.market);
    shelf.set(r.productId, printings);
  }
  const products: Record<string, number | null> = {};
  const runs = new Map<string, Record<string, number | null>>();
  for (const [id, link] of Object.entries(links)) {
    products[id] = link?.productId ?? null;
    for (const run of runLinksOf(link))
      runs.set(run.edition, { ...runs.get(run.edition), [id]: run.productId });
  }
  const points = cardPricesFromTcgcsv(language, products, shelf, usdToEur, date);
  const own = new Set(points.map((p) => `${p.tcgId}\u0001${p.printing}`));
  for (const [edition, ofRun] of runs) {
    for (const p of cardPricesFromTcgcsv(language, ofRun, shelf, usdToEur, date)) {
      const printing = runKey(edition, p.printing);
      if (!own.has(`${p.tcgId}\u0001${printing}`)) points.push({ ...p, printing });
    }
  }
  for (const [tcgId, prints] of Object.entries(finishPrints)) {
    if (links[tcgId]?.productId == null) continue;
    for (const print of prints) {
      const printings = shelf.get(print.productId);
      const usd = printings?.get(print.printing) ?? [...(printings?.values() ?? [])][0];
      if (usd == null || !(usd > 0)) continue;
      points.push({
        language,
        tcgId,
        printing: printProductKey(print.finish),
        date,
        price: Math.round(usd * usdToEur * 100) / 100,
        source: "tcgplayer",
      });
    }
  }
  for (const [tcgId, prints] of Object.entries(patternPrints)) {
    if (links[tcgId]?.productId == null) continue;
    for (const print of prints) {
      const printings = shelf.get(print.productId);
      const usd = printings?.get(print.printing) ?? [...(printings?.values() ?? [])][0];
      if (usd == null || !(usd > 0)) continue;
      points.push({
        language,
        tcgId,
        printing: patternPrintingKey(print.foilPattern, print.printing),
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
 * A card is linked in its own catalogue's links: an English link says nothing about a Japanese card
 * under the same id.
 */
export const unlinkedCardPrices = (
  points: PrintingDay[],
  links: Record<PriceLanguage, Record<string, TcgplayerLink | undefined>>,
): PrintingDay[] => points.filter((p) => links[p.language][p.tcgId]?.productId == null);

/**
 * Every held card's own price on this day, for the movers and the lines. Deduped on the card, its
 * catalogue and its id, each point under the catalogue its set is from.
 *
 * Both series are TCGplayer's since 2026-09-12; see the note inside for which printing each
 * reads. The holo series used to be Cardmarket's `-holo` fields.
 */
export function cardPricesFromSets(sets: CardSet[], date: string): PrintingDay[] {
  const seen = new Map<string, PrintingDay[]>();
  for (const set of sets) {
    for (const card of set.cards) {
      const language = priceLanguageOf(set.language);
      const key = card.tcgId ? historyKey(language, card.tcgId) : null;
      if (!card.tcgId || !key || seen.has(key) || !copiesHeld(card)) continue;
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
          days.push({
            language,
            tcgId: card.tcgId,
            printing,
            date,
            price: each,
            source: "tcgplayer",
          });
      }
      if (!days.length) {
        const own = shownPrice(card.price);
        if (own != null)
          days.push({
            language,
            tcgId: card.tcgId,
            printing: LEGACY.market,
            date,
            price: own,
            source: "tcgplayer",
          });
      }
      if (days.length) seen.set(key, days);
    }
  }
  return [...seen.values()].flat();
}
