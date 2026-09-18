import { patternPrintsFor } from "../catalogue/card-printings";
import type { Price } from "../price-basis.mjs";
import { patternPrintingKey } from "../price-months.mjs";
import type { PriceLanguage } from "../price-months.mjs";
import type { Finish, FoilPattern } from "./collection-row";
import { detailPrice, pricePatternPrints, usdToEurForRequest } from "./collection";

/**
 * Today's lowest listing of each of a card's printings that TCGplayer lists and has no market
 * figure for, in euros, keyed as the price history keys its printings ("reverse-holofoil",
 * "1st-edition-holofoil", "cosmos-holofoil"). A card sheet shows the pressed printing's figure
 * from its line, and a printing listed and never sold has no line: this is its figure, shown as
 * "From €…" and never summed (cardorb-api#561). A printing with a market figure is not here.
 */
export function listingsFrom(
  pricePrintings: Record<string, Price | null | undefined> | undefined,
  patternPrints: { foilPattern: FoilPattern; finish: Finish; price: Price | null }[] = [],
): Record<string, number> {
  const out: Record<string, number> = {};
  const listingOf = (p: Price | null | undefined) =>
    p && p.market == null && p.basis === "lowest-listing" && p.lowestListing != null
      ? p.lowestListing
      : null;
  for (const [name, p] of Object.entries(pricePrintings ?? {})) {
    const listing = listingOf(p);
    if (listing != null) out[name] = listing;
  }
  /* A pattern print is a product of its own, stored under the pattern and the printing its figure
     is filed under (patternPrintingKey): a cosmos holo's line is "cosmos-holofoil". */
  for (const print of patternPrints) {
    const listing = listingOf(print.price);
    if (listing == null) continue;
    const printing =
      print.finish === "holo"
        ? "holofoil"
        : print.finish === "reverse-holo"
          ? "reverse-holofoil"
          : "normal";
    out[patternPrintingKey(print.foilPattern, printing)] ??= listing;
  }
  return out;
}

/**
 * listingsFrom() for one card, read the way GET /v1/cards/{tcgId} prices it (detailPrice, and the
 * pattern prints on the English shelf). Empty where the day's rate is unknown.
 */
export async function printingListingsOf(
  tcgId: string,
  language: PriceLanguage,
): Promise<Record<string, number>> {
  const rate = await usdToEurForRequest();
  if (rate == null) return {};
  const own = language === "ja" ? "ja" : null;
  const [card, patterns] = await Promise.all([
    detailPrice({ id: tcgId, price: null, tcgplayerId: null }, own, rate),
    own ? Promise.resolve(null) : pricePatternPrints(patternPrintsFor(tcgId), rate),
  ]);
  return listingsFrom(card.pricePrintings ?? undefined, patterns?.prints ?? []);
}
