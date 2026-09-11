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
import { DAY, mapLimit, catalogueTimeout } from "../util";
import { priceOf, holoPriceOf } from "../price-basis.mjs";
import type { Price } from "../price-basis.mjs";

/** TCGplayer's numbers for one printing, in dollars, as TCGdex relays them. */
export type UsdPrice = { market: number | null; low: number | null };

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
 * TCGdex answered 404: the thing asked for is not in the catalogue.
 *
 * Its own class because it is the one failure a caller has to tell apart. A
 * card that is not there is a 404 for the client; a catalogue that does not
 * answer is a 503 nothing may cache. Both used to arrive as `Error("404")`
 * and `Error("503")`, and getCardDetail() treated every one as "not there".
 */
export class CatalogueNotFound extends Error {
  constructor(label: string) {
    super(`TCGdex has no ${label}`);
    this.name = "CatalogueNotFound";
  }
}

/**
 * A cached GET with a couple of retries.
 *
 * Everything artwork-related goes through here, and the retries are not
 * defensive padding: a build that asks TCGdex for sixty endpoints in a minute
 * gets some of them refused, and each refusal used to be swallowed. One of
 * those refusals landing on the sets index took the artwork off all 1904 cards
 * at once, because without the index no set can be resolved at all.
 *
 * A 404 is not retried: it is an answer, and asking twice more only costs two
 * round trips before the same one.
 */
export async function json(
  url: string,
  label: string,
  /** A day for artwork and sets; a search list asks for less, so a set published this week is found this week. */
  { revalidate = DAY }: { revalidate?: number } = {},
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { next: { revalidate }, signal: catalogueTimeout() });
      if (res.status === 404) throw new CatalogueNotFound(label);
      if (!res.ok) throw new Error(`${res.status}`);
      return await res.json();
    } catch (err) {
      if (err instanceof CatalogueNotFound) throw err;
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
 * One GraphQL call.
 *
 * Not cached: Next caches GETs, and TCGdex's GraphQL endpoint answers a GET
 * with its playground. So this is used only for what a cached GET cannot say
 * in one request — the English set index with its eras and dates, a set's
 * rarities and types, a page of search hits' facts — and the callers memoise
 * what is worth keeping. A field GraphQL cannot fill for one item nulls that
 * item alone, which is why every caller reads the answer as "maybe".
 */
export async function graphql(query: string, label: string): Promise<unknown> {
  const res = await fetch("https://api.tcgdex.net/v2/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
    cache: "no-store",
    signal: catalogueTimeout(),
  });
  if (!res.ok) throw new Error(`TCGdex ${label} answered ${res.status}`);
  const body = (await res.json()) as { data?: unknown };
  return body.data ?? null;
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
export type CardPrices = {
  /** Cardmarket's, in euros; null on a card Cardmarket does not price (an old promo) but TCGplayer does. */
  price: Price | null;
  holo: Price | null;
  /** TCGplayer's, in dollars, as TCGdex relays them: the second market for a card pokemontcg.io cannot reach. */
  usd?: UsdPrice | null;
};

/** The printings TCGdex lists TCGplayer's numbers under, in the order one is taken: the plain card first. */
const TCGPLAYER_PRINTINGS = [
  "normal",
  "holofoil",
  "reverse-holofoil",
  "1st-edition",
  "1st-edition-holofoil",
  "unlimited",
  "unlimited-holofoil",
];

/** TCGplayer's market and low for the first printing that has a market, or null. */
export function usdOf(
  tp:
    | Record<string, { marketPrice?: number | null; lowPrice?: number | null } | null | undefined>
    | null
    | undefined,
): UsdPrice | null {
  if (!tp) return null;
  const printing = TCGPLAYER_PRINTINGS.map((p) => tp[p]).find(
    (p) => p && typeof p.marketPrice === "number",
  );
  if (!printing) return null;
  return {
    market: printing.marketPrice ?? null,
    low: typeof printing.lowPrice === "number" ? printing.lowPrice : null,
  };
}

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
        tcgplayer?: Record<
          string,
          { marketPrice?: number | null; lowPrice?: number | null } | null | undefined
        > | null;
      };
    } | null;
    const cm = card?.pricing?.cardmarket;
    const price = cm ? priceOf(cm) : null;
    const usd = usdOf(card?.pricing?.tcgplayer);
    // Either market is worth keeping: a promo Cardmarket does not price is still a card TCGplayer does.
    if (price || usd) out.set(id, { price, holo: cm ? holoPriceOf(cm) : null, usd });
  });
  return out;
}

/**
 * TCGplayer's price for a list of TCGdex card ids — the second market, from the
 * catalogue that relays it.
 *
 * pokemontcg.io used to be asked per set for these, and by 2026-09-11 it answered
 * one set in eight (measured as the API reads it, three tries and a budget), so
 * the same card blended two markets on one instance and stood on Cardmarket
 * alone on the next. TCGdex carries TCGplayer's number on the card's own record
 * — 207 of 207 for 151 — the record pricesFor() already reads and json() keeps
 * for a day. One request per card, eight at a time, once a day.
 *
 * Tolerant per card: a card TCGdex would not answer for is left out, not the
 * set. Throws only when nothing at all came back for a list that asked for
 * something, so an outage is not cached as "no second market" for a day.
 */
export async function usdFor(ids: string[]): Promise<Map<string, UsdPrice>> {
  const out = new Map<string, UsdPrice>();
  let answered = 0;
  await mapLimit(ids, 8, async (id) => {
    let card: { pricing?: { tcgplayer?: Parameters<typeof usdOf>[0] } } | null;
    try {
      card = (await json(`https://api.tcgdex.net/v2/en/cards/${id}`, `card ${id}`)) as typeof card;
    } catch {
      return;
    }
    answered += 1;
    const usd = usdOf(card?.pricing?.tcgplayer);
    if (usd) out.set(id, usd);
  });
  if (ids.length && !answered) throw new Error("TCGdex answered for none of the cards");
  return out;
}
