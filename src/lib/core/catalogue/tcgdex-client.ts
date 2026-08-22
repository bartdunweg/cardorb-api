/**
 * The raw TCGdex HTTP calls, and nothing that decides what to do with the
 * answers. Split out of catalogue.ts, where this sat beside set-name
 * resolution and the unstable_cache front door with no seam between them.
 *
 * `unstable_cache` itself stays out of this file on purpose — see the note in
 * eslint.config.mjs, which keeps that import to catalogue.ts and
 * collection.ts so the eventual move to `use cache` stays a two-file change.
 * This file only ever runs inside a call that one of those two already cached.
 */
import { DAY, mapLimit } from "../util";
import { priceOf, holoPriceOf } from "../price-basis.mjs";
import type { Price } from "../price-basis.mjs";

export type TcgSet = { id: string; name: string };
export type TcgCard = { id: string; localId?: string; name?: string; image?: string };
export type TcgSetDetail = {
  id: string;
  name?: string;
  logo?: string;
  /** The little round set icon. The only art some sets have. */
  symbol?: string;
  releaseDate?: string;
  cardCount?: { official?: number; total?: number };
  abbreviation?: { official?: string };
  cards?: TcgCard[];
};

/**
 * A cached GET with a couple of retries.
 *
 * Everything artwork-related goes through here, and the retries are not
 * defensive padding: a build that asks TCGdex for sixty endpoints in a minute
 * gets some of them refused, and each refusal used to be swallowed. One of
 * those refusals landing on the sets index took the artwork off all 1904 cards
 * at once, because without the index no set can be resolved at all.
 */
export async function json(url: string, label: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { next: { revalidate: DAY } });
      if (!res.ok) throw new Error(`${res.status}`);
      return await res.json();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      console.error(`TCGdex ${label} failed after 3 attempts:`, message);
      throw err;
    }
  }
}

/**
 * One set, with a retry.
 *
 * This used to swallow failures silently, which made a bad situation invisible:
 * a refused fetch costs a whole section its artwork, and on the first live run
 * the sets with a Trainer Gallery came out empty even though the same lookup
 * succeeded every time when run on its own.
 */
export async function fetchSet(id: string): Promise<TcgSetDetail | null> {
  try {
    return (await json(`https://api.tcgdex.net/v2/en/sets/${id}`, `set ${id}`)) as TcgSetDetail;
  } catch {
    // Already logged. One missing set costs that section its artwork; the rest
    // of the collection is still worth rendering.
    return null;
  }
}

/**
 * Cardmarket's prices for a list of TCGdex card ids.
 *
 * One request per card, because the set endpoint carries only id, image,
 * localId and name: the prices live on the individual card. Measured at eight
 * at a time; json() caches each for a day, so a revalidation an hour later
 * refetches nothing. Prices move slower than a binder does.
 *
 * Note what that day-long fetch cache buys even when nothing is pre-priced:
 * two people who own the same card still only cost one request between them,
 * because the second one hits the HTTP cache rather than TCGdex. Pre-pricing a
 * whole set is an optimisation on top of that, not a replacement for it.
 */
/**
 * Both printings, because Cardmarket prices both and TCGdex passes both on.
 *
 * `holo` is the foil — the reverse holo, and the holo rare on older sets —
 * which arrives in the same object under `-holo` keys and is null far more
 * often than not. holoPriceOf() is what turns the zeros those fields carry into
 * null; see its comment for why reading them raw would value a reverse holo at
 * nothing.
 */
export type CardPrices = { price: Price; holo: Price | null };

export async function pricesFor(ids: string[]): Promise<Map<string, CardPrices>> {
  const out = new Map<string, CardPrices>();
  await mapLimit(ids, 8, async (id) => {
    const card = (await json(`https://api.tcgdex.net/v2/en/cards/${id}`, `card ${id}`)) as {
      pricing?: {
        cardmarket?: {
          low?: number | null;
          trend?: number | null;
          avg30?: number | null;
          "low-holo"?: number | null;
          "trend-holo"?: number | null;
          "avg30-holo"?: number | null;
        };
      };
    } | null;
    const cm = card?.pricing?.cardmarket;
    if (!cm) return;
    const price = priceOf(cm);
    if (price) out.set(id, { price, holo: holoPriceOf(cm) });
  });
  return out;
}
