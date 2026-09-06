/**
 * What a collection is worth today, priced from Cardmarket's own guide.
 *
 * Pulled out as a pure function because two callers have to agree on it and one
 * of them cannot be tested: scripts/snapshot-collection-value.mjs, which fills
 * in history from the Internet Archive, and the weekly cron, which adds today's
 * point. If those two computed the value differently the chart would step every
 * time the cron took over from a manual run, and nothing would say why.
 *
 * ── Why the guide rather than the card's own price ─────────────────────────
 *
 * Every screen reads `card.price`, which buildCollection() resolves per card
 * from TCGdex. That is right for a page: it prices what is on screen, and the
 * collection cache holds it for an hour.
 *
 * It is wrong for a batch job. With CATALOGUE_SET_PRICING_MAX at 0 — the
 * default — resolving prices that way costs one TCGdex request per matched
 * card, so a weekly snapshot of a sixteen-hundred card binder would make
 * sixteen hundred requests to arrive at numbers Cardmarket publishes as a
 * single file. Hence `buildCollection(rows, { prices: false })` at the call
 * sites, and hence this function taking the guide.
 *
 * Both routes end at the same two functions, priceOf() and shownPrice(), so a
 * point on the chart and the tile above it are the same kind of number. They
 * are not the same number to the cent — TCGdex mirrors Cardmarket rather than
 * being it — and that is a difference of source, not of method.
 */

import { copiesHeld } from "./cards-stats";
import { priceOf, holoPriceOf, shownPrice } from "../price-basis.mjs";
import type { CardSet } from "./cards";
import type { ValueSnapshot } from "./value-snapshot";
import type { CardPricePoint } from "./movers";

/** One row of Cardmarket's public price guide, as much of it as is read. */
export type GuideRow = {
  idProduct: number;
  low?: number | null;
  trend?: number | null;
  avg30?: number | null;
  /** The foil printing, priced separately. Often 0, which is not a price. */
  "low-holo"?: number | null;
  "trend-holo"?: number | null;
  "avg30-holo"?: number | null;
};

export type PriceGuide = {
  /** ISO timestamp. The day the guide was built, which dates the snapshot. */
  createdAt: string;
  priceGuides: GuideRow[];
};

/** tcgId to Cardmarket idProduct, as lib/core/cardmarket-ids.generated.json has it. */
export type ProductIds = Record<string, number | null>;

/**
 * One dated reading over a built collection.
 *
 * `cards` counts copies rather than cards, matching copiesHeld() and therefore
 * the "Collection value" tile: a card held as a normal printing and again as a
 * reverse holo is two copies of one card, and valuing it once was the bug
 * was closed. `priced` and `unpriced` stay counts of distinct cards,
 * because they answer how much of the collection could be valued at all, which
 * is a question about coverage rather than about holdings.
 *
 * Deliberately no acquired_at filter, unlike the script's valueAt(). This
 * values the binder as it is now, and everything in it is in it today; the
 * script needs the filter because it prices a 2024 guide against a collection
 * that has grown since.
 */
/**
 * Every card's price on this day, for the cards this collection actually holds.
 *
 * Separate from snapshotOf() because it answers a different question and is
 * written to a different table: this is about cards, that is about a person.
 * Deduped on tcgId — two people, or two printings, are one card and one price.
 *
 * Only cards that are held: pricing the whole catalogue weekly would be a
 * hundred thousand rows a week to answer questions about sixteen hundred cards.
 */
export function cardPricesOf(
  sets: CardSet[],
  guide: PriceGuide,
  ids: ProductIds,
): CardPricePoint[] {
  const byProduct = new Map(guide.priceGuides.map((r) => [r.idProduct, r]));
  const date = guide.createdAt.slice(0, 10);
  const seen = new Map<string, CardPricePoint>();

  for (const set of sets) {
    for (const card of set.cards) {
      if (!card.tcgId || seen.has(card.tcgId) || !copiesHeld(card)) continue;
      const product = ids[card.tcgId];
      const row = product == null ? undefined : byProduct.get(product);
      if (!row) continue;
      const normal = priceOf(row);
      const foil = holoPriceOf(row);
      // A card Cardmarket published nothing for is not a reading of zero.
      if (!normal?.market && !foil?.market) continue;
      seen.set(card.tcgId, {
        tcgId: card.tcgId,
        date,
        market: normal?.market ?? null,
        holo: foil?.market ?? null,
      });
    }
  }
  return [...seen.values()];
}

export function snapshotOf(sets: CardSet[], guide: PriceGuide, ids: ProductIds): ValueSnapshot {
  const byProduct = new Map(guide.priceGuides.map((r) => [r.idProduct, r]));

  let value = 0;
  let copies = 0;
  let priced = 0;
  let unpriced = 0;

  for (const set of sets) {
    for (const card of set.cards) {
      const held = copiesHeld(card);
      if (!held) continue;
      copies += held;

      const product = card.tcgId ? ids[card.tcgId] : null;
      const row = product == null ? undefined : byProduct.get(product);
      const normal = row ? priceOf(row) : null;
      const foil = row ? holoPriceOf(row) : null;
      if (!normal && !foil) {
        unpriced++;
        continue;
      }

      /**
       * Printing by printing, exactly as heldValue() does it on the page.
       *
       * The two have to agree: this is the chart and that is the tile above it.
       * The shape differs because the source does — here the two prices come
       * out of one guide row rather than off the card — but the rule is the
       * same one, and variantPrice() is the sentence it is written in.
       */
      let any = false;
      for (const v of card.variants) {
        if (!v.owned) continue;
        // reverse-holo only, never plain holo. See variantPrice() in cards.ts
        // for the measurement behind that: on a holo-only card the -holo fields
        // describe a different, thinner market at 0.47x the plain price.
        const each = shownPrice((v.finish === "reverse-holo" && foil) || normal);
        if (each == null) continue;
        value += each * Math.max(0, v.quantity ?? 0);
        any = true;
      }
      if (any) priced++;
      else unpriced++;
    }
  }

  return {
    date: guide.createdAt.slice(0, 10),
    // Euros, unrounded. ValueSnapshot documents whole euros because that is
    // what comes back *out* of storage — listValueSnapshots() rounds on the way
    // up. Going in, the writer converts to cents, so the one rounding happens
    // at the boundary rather than accumulating a cent per card on the way here.
    value,
    cards: copies,
    priced,
    unpriced,
  };
}

/**
 * The reading off an assembled collection: the card's own blended price, the one
 * the tile and the sheet show, so the line ends where the number stands. Printing
 * by printing as snapshotOf() does it; a card with no price on it is unpriced.
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
        const each = shownPrice((v.finish === "reverse-holo" && card.priceHolo) || card.price);
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

/** Every held card's own blended price on this day, for the movers and the lines. Deduped on tcgId. */
export function cardPricesFromSets(sets: CardSet[], date: string): CardPricePoint[] {
  const seen = new Map<string, CardPricePoint>();
  for (const set of sets) {
    for (const card of set.cards) {
      if (!card.tcgId || seen.has(card.tcgId) || !copiesHeld(card)) continue;
      const market = shownPrice(card.price);
      const holo = shownPrice(card.priceHolo);
      if (market == null && holo == null) continue;
      seen.set(card.tcgId, { tcgId: card.tcgId, date, market, holo });
    }
  }
  return [...seen.values()];
}
