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
export type UsdPrice = {
  market: number | null;
  low: number | null;
  /** TCGplayer's product id for the printing the figure is from: an address a person can open. */
  productId?: number | null;
};

/**
 * A set as the index lists it. `cardCount` is the index's own count, and it is what tells a set
 * that genuinely has no cards yet from a record that answered with none: see loadSetCatalogue().
 */
export type TcgSet = {
  id: string;
  name: string;
  cardCount?: { official?: number; total?: number };
};
export type TcgCard = { id: string; localId?: string; name?: string; image?: string };
export type TcgSetDetail = {
  id: string;
  name?: string;
  logo?: string;
  /** The little round set icon. The only art some sets have. */
  symbol?: string;
  releaseDate?: string;
  /** The era the set belongs to: "sv" for Scarlet & Violet, promos included. */
  serie?: { id?: string; name?: string };
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
 * TCGdex is down and was not asked: the breaker below is open.
 *
 * Its own class so a caller can tell "not asked" from "asked and refused",
 * though every caller today treats both as the outage they are.
 */
export class CatalogueDown extends Error {
  constructor(label: string) {
    super(`TCGdex is down, ${label} not asked`);
    this.name = "CatalogueDown";
  }
}

/**
 * The breaker. On the evening of 2026-09-04 TCGdex stopped answering, and
 * every collection read then waited on three attempts — up to three eight-
 * second timeouts and two pauses — before the rows came back without the
 * catalogue (#164, #165). The app read as down when it was only slow.
 *
 * So after a call has failed its three attempts, every call on this instance
 * for the next twenty seconds fails at once, without asking. When the window
 * has passed the next call goes through and finds out; an answer closes the
 * breaker, a failure opens it again. Per instance, because that is where the
 * waiting happens: an instance that has just watched TCGdex time out three
 * times has all the evidence it needs, and none to share.
 *
 * A 404 never trips it — that is an answer, not an outage.
 */
const BREAKER_MS = 20_000;
let openUntil = 0;
const refused = (label: string): void => {
  if (Date.now() < openUntil) throw new CatalogueDown(label);
};
const tripped = (): void => {
  openUntil = Date.now() + BREAKER_MS;
};
const answered = (): void => {
  openUntil = 0;
};
/**
 * For the tests alone: vitest.setup.ts closes the breaker before every test,
 * because a test that plays an outage would otherwise leave the next test in
 * the same file refused for twenty seconds. Nothing in src/ calls this.
 */
export const resetBreaker = answered;

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
  refused(label);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { next: { revalidate }, signal: catalogueTimeout() });
      if (res.status === 404) throw new CatalogueNotFound(label);
      if (!res.ok) throw new Error(`${res.status}`);
      const body = await res.json();
      answered();
      return body;
    } catch (err) {
      if (err instanceof CatalogueNotFound) throw err;
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      console.error(`TCGdex ${label} failed after 3 attempts:`, message);
      tripped();
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
  refused(label);
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
  /**
   * The stamped first run's dollars, where TCGplayer prices that run apart: Jungle, Fossil,
   * Team Rocket, Gym and Neo. Null everywhere else, Base Set included, where both markets file
   * the runs as products of their own that nothing links to a card id.
   */
  usdFirstEd?: UsdPrice | null;
  /** Every printing TCGplayer prices, by its own name: which one a copy is worth is a question about the copy. */
  usdPrintings?: Record<string, UsdPrice & { productId: number | null }>;
  /**
   * The Shadowless run's euros, where Cardmarket files that run as a product of its own: Base
   * Set, every card of it. From the same nightly guide as `price`, under the product id
   * map held, which was deleted with Cardmarket on 2026-09-12. Null everywhere.
   */
  shadowless?: Price | null;
};

/**
 * The printings TCGdex lists TCGplayer's numbers under, in the order one is taken: the plain
 * card first, and the ordinary run before the stamped one.
 *
 * 1st Edition used to sit before unlimited, and TCGplayer splits the two for Jungle, Fossil,
 * Team Rocket, Gym and Neo: Neo Genesis Lugia is $1,085 as a 1st Edition and $519 as an
 * unlimited, and this figure is blended into the one price every copy of the card shows
 * (factsWithUsd in collection/collection.ts). So a collection of unlimited copies read as the
 * stamped run's money. A copy is the ordinary run unless somebody says otherwise, which is
 * what `edition` on the row is for.
 */
const TCGPLAYER_PRINTINGS = [
  "normal",
  "holofoil",
  "reverse-holofoil",
  "unlimited",
  "unlimited-holofoil",
  "1st-edition",
  "1st-edition-holofoil",
];

/**
 * The printings that are the stamped first run, in the order one is taken.
 *
 * Told apart from the list above rather than mixed into it: these are a different market. A
 * 1st Edition Neo Genesis Lugia trades at $1,085 where the unlimited one is $519, and a figure
 * from one run standing in for the other is wrong by multiples either way.
 */
const TCGPLAYER_FIRST_ED = ["1st-edition-holofoil", "1st-edition"];

/** TCGplayer's market and low for the first of `printings` that has a market, or null. */
function firstWithMarket(
  tp:
    | Record<
        string,
        | { marketPrice?: number | null; lowPrice?: number | null; productId?: number | null }
        | null
        | undefined
      >
    | null
    | undefined,
  printings: string[],
): UsdPrice | null {
  if (!tp) return null;
  const printing = printings.map((p) => tp[p]).find((p) => p && typeof p.marketPrice === "number");
  if (!printing) return null;
  return {
    market: printing.marketPrice ?? null,
    low: typeof printing.lowPrice === "number" ? printing.lowPrice : null,
    productId: typeof printing.productId === "number" ? printing.productId : null,
  };
}

/**
 * Both runs' dollars for one card: the ordinary printing and the stamped one.
 *
 * A pair rather than two maps, because the two are read together everywhere and a card that has
 * one and not the other is the normal case.
 */
export type UsdPair = {
  usd: UsdPrice | null;
  firstEd: UsdPrice | null;
  /** Every printing TCGplayer prices, by its own name, with the product id beside each. */
  printings?: Record<string, UsdPrice & { productId: number | null }>;
};

/** The stamped first run's dollars, where TCGplayer prices that run apart. Null otherwise. */
export const usdFirstEdOf = (tp: Parameters<typeof firstWithMarket>[0]): UsdPrice | null =>
  firstWithMarket(tp, TCGPLAYER_FIRST_ED);

/**
 * Every printing TCGplayer prices for one card, by its own name, with the product id beside it.
 *
 * The pickers above answer "one figure for this card", which is the question that was asked
 * while a card was one price. It is not the question a copy asks: a Jungle Scyther is a holo at
 * $61 and a plain rare at $17, TCGplayer knows both apart, and the first-with-a-market rule
 * handed every copy the plain one. The chooser lives in price-basis.mjs, beside the rule that
 * says which of Cardmarket's two series a copy reads, because it is the same sentence.
 *
 * The product id travels because it is the only way to a page about this printing, which is
 * what a person checking a figure needs (Bart, 2026-09-12).
 */
export const usdPrintingsOf = (
  tp:
    | Record<
        string,
        | { marketPrice?: number | null; lowPrice?: number | null; productId?: number | null }
        | null
        | undefined
      >
    | null
    | undefined,
): Record<string, UsdPrice & { productId: number | null }> => {
  const out: Record<string, UsdPrice & { productId: number | null }> = {};
  for (const [printing, v] of Object.entries(tp ?? {})) {
    if (!v || typeof v.marketPrice !== "number") continue;
    out[printing] = {
      market: v.marketPrice,
      low: typeof v.lowPrice === "number" ? v.lowPrice : null,
      productId: typeof v.productId === "number" ? v.productId : null,
    };
  }
  return out;
};

/** TCGplayer's market and low for the first printing that has a market, or null. */
export function usdOf(
  tp:
    | Record<
        string,
        | { marketPrice?: number | null; lowPrice?: number | null; productId?: number | null }
        | null
        | undefined
      >
    | null
    | undefined,
): UsdPrice | null {
  return firstWithMarket(tp, TCGPLAYER_PRINTINGS);
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
          | { marketPrice?: number | null; lowPrice?: number | null; productId?: number | null }
          | null
          | undefined
        > | null;
      };
    } | null;
    const cm = card?.pricing?.cardmarket;
    const price = cm ? priceOf(cm) : null;
    const usd = usdOf(card?.pricing?.tcgplayer);
    const usdFirstEd = usdFirstEdOf(card?.pricing?.tcgplayer);
    const usdPrintings = usdPrintingsOf(card?.pricing?.tcgplayer);
    // Either market is worth keeping: a promo Cardmarket does not price is still a card TCGplayer does.
    if (price || usd)
      out.set(id, { price, holo: cm ? holoPriceOf(cm) : null, usd, usdFirstEd, usdPrintings });
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
export async function usdFor(ids: string[]): Promise<Map<string, UsdPair>> {
  const out = new Map<string, UsdPair>();
  let answered = 0;
  await mapLimit(ids, 8, async (id) => {
    let card: { pricing?: { tcgplayer?: Parameters<typeof usdPrintingsOf>[0] } } | null;
    try {
      card = (await json(`https://api.tcgdex.net/v2/en/cards/${id}`, `card ${id}`)) as typeof card;
    } catch {
      return;
    }
    answered += 1;
    const usd = usdOf(card?.pricing?.tcgplayer);
    const firstEd = usdFirstEdOf(card?.pricing?.tcgplayer);
    const printings = usdPrintingsOf(card?.pricing?.tcgplayer);
    if (usd || firstEd) out.set(id, { usd, firstEd, printings });
  });
  if (ids.length && !answered) throw new Error("TCGdex answered for none of the cards");
  return out;
}
