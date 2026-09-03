import { holoPriceOf, priceOf } from "../price-basis.mjs";
import { catalogueTimeout } from "../util";
import type { CardPrices } from "./tcgdex-client";
import type { GuideRow, PriceGuide, ProductIds } from "../collection/snapshot";

/**
 * Cardmarket's own price guide: every product's prices, one file, rebuilt
 * nightly. Public, no login.
 *
 * This is where a card's price comes from when the collection is built. It
 * used to be one TCGdex request per matched card — sixteen hundred of them
 * for a cold build, minutes in which the first visitor after a deploy waited
 * or gave up. TCGdex mirrors this file; reading the file directly is one
 * request for every card at once. The nightly snapshot has read it this way
 * from the start (see lib/core/collection/snapshot.ts), so the two now agree
 * to the cent.
 */
export const GUIDE_URL =
  "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json";

export async function fetchPriceGuide(): Promise<PriceGuide> {
  const res = await fetch(GUIDE_URL, {
    headers: { "User-Agent": "cardorb.com" },
    signal: catalogueTimeout(),
  });
  if (!res.ok) throw new Error(`The price guide answered ${res.status}.`);
  const guide = (await res.json()) as PriceGuide;
  if (!guide?.priceGuides?.length || !guide.createdAt) {
    throw new Error("The price guide came back empty.");
  }
  return guide;
}

/**
 * The prices of the given cards, from the guide. A card without a Cardmarket
 * product id (the committed mapping does not know it yet) or without a row in
 * the guide is simply absent, and the caller decides what to do about it.
 * Same arithmetic as the snapshot: priceOf() and holoPriceOf().
 */
export function guidePrices(
  ids: string[],
  guide: PriceGuide,
  products: ProductIds,
): Map<string, CardPrices> {
  const byProduct = new Map<number, GuideRow>(guide.priceGuides.map((r) => [r.idProduct, r]));
  const out = new Map<string, CardPrices>();
  for (const id of ids) {
    const product = products[id];
    const row = product == null ? undefined : byProduct.get(product);
    if (!row) continue;
    const price = priceOf(row);
    if (price) out.set(id, { price, holo: holoPriceOf(row) });
  }
  return out;
}
