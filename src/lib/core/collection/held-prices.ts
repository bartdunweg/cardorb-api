import { historyKey, priceLanguageOf } from "../price-months.mjs";
import type { Price } from "../price-basis.mjs";
import type { UsdPair } from "../catalogue/tcgdex-client";
import type { CardSet, OwnedCard } from "./cards";
import type { CardPricePoint } from "./movers";

/**
 * The collection's prices with a stray sale held over, the way the price line holds it.
 *
 * A card's price is TCGplayer's latest market figure (tcgplayer_prices), and its line is the same
 * figures day by day (card_price_months). The line leaves out a stray sale and holds the figure
 * before it (price-months.mjs, cardorb-api#493 and #496); the price above it did not, so on a day
 * Base Set Charizard's 1st Edition sold once for $250 the sheet said €219 over a flat €8,700 line,
 * and the collection's value moved by the difference (Bart, 2026-09-15).
 *
 * Only where the line's last day is the day the prices are from (`priceDay`): the line is written
 * from the same shelf the same night, and on a night it was not, its last held figure is about
 * another day. Scaled by the held figure over the stray one rather than set to it, because the
 * line is in euros at that night's rate and the price at today's.
 */
export function holdStrayPrices(
  sets: CardSet[],
  points: readonly CardPricePoint[],
  priceDay: string,
): CardSet[] {
  const held = heldDays(points, priceDay);
  if (!held.size) return sets;
  return sets.map((set) => {
    const language = priceLanguageOf(set.language);
    let changed = false;
    const cards = set.cards.map((card) => {
      const day = card.tcgId ? held.get(historyKey(language, card.tcgId)) : undefined;
      if (!day) return card;
      changed = true;
      return holdCard(card, day);
    });
    return changed ? { ...set, cards } : set;
  });
}

/** What the line says about one card on the price day: every printing's figure, and the strays it held over. */
export type HeldDay = { printings: Record<string, number>; held: Record<string, number> };

/** The price day's held points by catalogue and card; a point of another day, or one that held nothing, is not one. */
export function heldDays(
  points: readonly CardPricePoint[],
  priceDay: string,
): Map<string, HeldDay> {
  const held = new Map<string, HeldDay>();
  for (const p of points) {
    if (p.date !== priceDay || !p.held || !p.printings) continue;
    held.set(historyKey(p.language, p.tcgId), { printings: p.printings, held: p.held });
  }
  return held;
}

/** The printings the line held a stray sale over: the figure it kept, and the stray one it stands in for. */
function* heldOver(day: HeldDay): Generator<[printing: string, kept: number, stray: number]> {
  for (const [printing, stray] of Object.entries(day.held)) {
    const kept = day.printings[printing];
    if (kept != null && stray > 0) yield [printing, kept, stray];
  }
}

/** Today's figure scaled by the held one over the stray one: the line is in euros at its night's rate, the price at today's. */
const scaledBy = (market: number, kept: number, stray: number): Price => ({
  market: Math.round(market * (kept / stray) * 100) / 100,
});

/**
 * A browse card's one price with a stray sale held over, the same way: the set page, a search and
 * the catalogue's card list carry one figure a card, TCGplayer's first printing with a market
 * (usdOf), so the held printing is found by that dollar figure among the card's printings.
 */
export function holdShelfPrice(price: Price, pair: UsdPair, day: HeldDay): Price {
  const headline = pair.usd?.market;
  if (headline == null || price.market == null) return price;
  for (const [printing, kept, stray] of heldOver(day)) {
    if (pair.printings?.[printing]?.market === headline) return scaledBy(price.market, kept, stray);
  }
  return price;
}

function holdCard(card: OwnedCard, day: HeldDay): OwnedCard {
  if (!card.pricePrintings) return card;
  const pricePrintings = { ...card.pricePrintings };
  let price = card.price;
  let priceFirstEd = card.priceFirstEd ?? null;
  for (const [printing, kept, stray] of heldOver(day)) {
    const now = pricePrintings[printing];
    if (now?.market == null) continue;
    const scaled = scaledBy(now.market, kept, stray);
    pricePrintings[printing] = scaled;
    // The card's own price and its stamped run's are one of its printings' figures: held with it.
    if (price?.market === now.market) price = scaled;
    if (printing.startsWith("1st-edition") && priceFirstEd?.market === now.market)
      priceFirstEd = scaled;
  }
  return { ...card, price, priceFirstEd, pricePrintings };
}
