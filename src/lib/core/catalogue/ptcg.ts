/**
 * The second catalogue, for what the first one has not published.
 *
 * TCGdex is where /cards gets everything, and it is missing a handful of
 * pictures rather than a handful of facts: Temporal Forces has no set logo at
 * all, and the priciest card in the binder (a €440 Pikachu with a grey felt
 * hat) has no scan. Neither is going to be fixed by asking again, and both
 * exist at pokemontcg.io.
 *
 * So for pictures this is a fallback and nothing else: consulted only where the
 * first source came back empty, one index request per build, and it never
 * overrides anything TCGdex does have. For prices it is the second market:
 * TCGplayer's numbers for a whole set, once a day, averaged into the shown
 * figure (see ptcgPrices and blendPrices in price-basis.mjs). Keeping it here rather than in lib/cards.ts is the
 * point: the day it goes away, one file's worth of picture-of-last-resort goes
 * with it and the page is exactly as complete as TCGdex is.
 */

import { DAY, cardNumber, norm, catalogueTimeout } from "../util";
import { sameCard } from "./matching";
import { isGalleryNumber, ptcgSetName } from "./set-aliases";

type PtcgSet = { id: string; name: string; images?: { logo?: string } };

/* Where the two catalogues call the same set by different names — three
   entries, and they moved to set-aliases.ts once browse started asking the same
   question in the opposite direction. See that file for why the table is short
   and why it is not the one in catalogue.ts. */

let index: Promise<Map<string, PtcgSet>> | null = null;

/**
 * Their whole set list, by name, fetched once and cached for a day.
 *
 * With retries, because this host answers 500 and 502 more often than it does
 * not, and one refusal used to take both of the pictures this file exists for
 * off the page: the promise is module-level, so the empty map it resolved to
 * was then handed to all 1,622 cards for the rest of the build. A failure is
 * not cached now: the next caller tries again, and only a build where every
 * attempt failed ends up where it started, which is where it was before this
 * file existed.
 */
function sets(): Promise<Map<string, PtcgSet>> {
  index ??= (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch("https://api.pokemontcg.io/v2/sets", {
          next: { revalidate: DAY },
          signal: catalogueTimeout(),
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { data?: PtcgSet[] };
        const out = new Map<string, PtcgSet>();
        for (const set of body.data ?? []) out.set(norm(set.name), set);
        if (out.size) return out;
        throw new Error("empty set index");
      } catch (err) {
        if (attempt === 2) {
          // A fallback that cannot be reached is not an error worth failing a
          // build over: the page renders with whatever TCGdex gave it.
          console.error("pokemontcg.io set index unavailable:", err);
          index = null;
          return new Map<string, PtcgSet>();
        }
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    return new Map<string, PtcgSet>();
  })();
  return index;
}

const find = async (setName: string) => {
  const all = await sets();
  const alias = ptcgSetName(setName);
  return (alias ? all.get(norm(alias)) : null) ?? all.get(norm(setName)) ?? null;
};

/* A gallery number: Trainer Gallery's TG01 and up, Crown Zenith's GG01 and up.
   Defined in set-aliases.ts beside the set-name half of the same rule, and
   re-exported here because this is where it was written and where callers look
   for it. */
export { isGalleryNumber } from "./set-aliases";

/**
 * The gallery subset of a set, when they file one.
 *
 * A Sword & Shield set keeps its Trainer Gallery cards in a set of its own, and
 * both catalogues name it by extending the parent — "Silver Tempest Trainer
 * Gallery", "Crown Zenith Galarian Gallery". The collection files them under the
 * parent, the way a collector thinks about them, so a TG number arrives here
 * asking for a set this index does not have under that name.
 *
 * Matched by prefix rather than by building the name, for the same reason
 * resolveSetIds() does it (lib/core/catalogue/catalogue.ts): "Trainer" and "Galarian" are
 * not the only two words this could ever be, and a prefix that also says
 * "gallery" cannot drag in an unrelated set.
 */
const findGallery = async (setName: string) => {
  const all = await sets();
  const parent = norm(setName);
  if (!parent) return null;
  for (const [name, set] of all) {
    if (name !== parent && name.startsWith(parent) && name.includes("gallery")) return set;
  }
  return null;
};

/** Their logo for a set, when they have one and TCGdex does not. */
export async function ptcgLogo(setName: string): Promise<string | null> {
  return (await find(setName))?.images?.logo ?? null;
}

/**
 * The cards in one of their sets, by number, fetched once per set and cached
 * for a day.
 *
 * Asked for two things. A gallery set, to answer "is TG04 the card this row
 * says it is": the collection's gallery numbering does not line up with
 * anyone's — every one of the 23 gallery rows in it is filed under a number
 * that belongs to a different card — so the URL this file would otherwise
 * build lands on the wrong Pokémon every time. And a promo set, where this
 * host numbers a card "SM191" and the collection writes "191", so the picture
 * is filed under a name the row does not know. Both answers are the same
 * shape: their number, and the name at it to check the answer against.
 *
 * The whole point of the second catalogue is the pictures TCGdex lacks; a
 * wrong one is worse than the empty slot it replaces.
 */
const cardNames = new Map<string, Promise<Map<string, { number: string; name: string }>>>();

function namesIn(setId: string): Promise<Map<string, { number: string; name: string }>> {
  let pending = cardNames.get(setId);
  if (pending) return pending;
  pending = (async () => {
    const PAGE = 250;
    try {
      const out = new Map<string, { number: string; name: string }>();
      // Paged, because a promo set outgrew one page: SWSH Black Star Promos has 304 cards, and
      // asking for 250 of them left the Galarian birds (SWSH282–284) outside the answer, which
      // reads the same as "this host does not have them". Four pages is a thousand cards, past
      // any set there has been; the loop stops at a short page either way.
      for (let page = 1; page <= 4; page++) {
        const url = `https://api.pokemontcg.io/v2/cards?q=set.id:${setId}&select=number,name&pageSize=${PAGE}&page=${page}`;
        const res = await fetch(url, { next: { revalidate: DAY }, signal: catalogueTimeout() });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { data?: { number?: string; name?: string }[] };
        const rows = body.data ?? [];
        for (const c of rows)
          if (c.number && c.name) out.set(norm(c.number), { number: c.number, name: c.name });
        if (rows.length < PAGE) break;
      }
      if (!out.size) throw new Error("empty card list");
      return out;
    } catch (err) {
      // Not cached, for the same reason the set index is not: this host answers
      // 500 and 502 often enough that one refusal must not decide the whole
      // build. An empty map means "unverifiable", which the caller reads as no.
      console.error(`pokemontcg.io card list unavailable for ${setId}:`, err);
      cardNames.delete(setId);
      return new Map<string, { number: string; name: string }>();
    }
  })();
  cardNames.set(setId, pending);
  return pending;
}

/**
 * Their scan of one card, guessed from the set they file it under.
 *
 * Their card images are addressed by set and number with no leading zeros, so
 * once the set is known the URL is not a lookup. A HEAD confirms it before the
 * page is told the picture exists; a card they have not published either
 * answers 404 here and keeps its empty slot.
 *
 * A gallery number is looked up against the gallery subset first, and that is
 * the whole reason a TG card can be found here when it cannot be found at
 * Limitless: this address is the printed number under a set of its own, where
 * Limitless renumbers gallery cards into the parent's run and finding them there
 * would mean guessing an offset (see lib/core/catalogue/catalogue.ts).
 *
 * It is also the one lookup here that is checked against the row's name before
 * it is believed, which is the same guard buildCollection() puts on a TCGdex
 * match and for the same reason. It earns its request: the collection's gallery
 * numbering matches neither catalogue, so without it every gallery row would
 * come back with a picture of a different Pokémon. `name` is optional only so
 * the ordinary path, where the number is the collection's own and has already
 * been trusted for years, does not pay for a card list it has no use for.
 */
export async function ptcgScan(
  setName: string,
  number: string,
  name?: string,
): Promise<string | null> {
  const gallery = isGalleryNumber(number) ? await findGallery(setName) : null;
  const set = gallery ?? (await find(setName));
  if (!set) return null;
  const n = number.replace(/^0+/, "");
  if (!n) return null;
  if (gallery) {
    const theirs = (await namesIn(gallery.id)).get(norm(n));
    // No name to check against, no card at that number, a card by another name,
    // or a card list this host would not hand over: all of them mean the empty
    // slot stays. Only a number that demonstrably holds this card gets a picture.
    if (!name || !theirs || !sameCard(theirs.name, name)) return null;
  }
  const found = await published(set.id, n);
  if (found) return found;

  // A promo set numbers its cards after itself — "SM191", "SWSH282" — where the
  // collection keeps the digits it can read off the card. The bare number is a
  // 404 there, and it was: thirteen promos in this collection had no picture
  // because of it, the tag-team GX ones among them. So the set's own list says
  // what it calls the card, and the name at that number has to agree before the
  // picture is used, exactly as a gallery's does.
  if (!name || /^[A-Za-z]/.test(n)) return null;
  const digits = n.replace(/^0+/, "");
  for (const theirs of (await namesIn(set.id)).values()) {
    if (theirs.number.replace(/^[A-Za-z]*0*/, "") !== digits) continue;
    if (!sameCard(theirs.name, name)) continue;
    return await published(set.id, theirs.number);
  }
  return null;
}

/** Their file for a set and a number, when there is one behind the address. */
async function published(setId: string, number: string): Promise<string | null> {
  const url = `https://images.pokemontcg.io/${setId}/${number}.png`;
  try {
    const head = await fetch(url, {
      method: "HEAD",
      next: { revalidate: DAY },
      signal: catalogueTimeout(),
    });
    return head.ok ? url : null;
  } catch {
    return null;
  }
}

/** TCGplayer's numbers for one printing, in dollars, as pokemontcg.io relays them. */
export type UsdPrice = { market: number | null; low: number | null };

type PtcgPriceCard = {
  tcgplayer?: {
    prices?: Record<string, { low?: number | null; market?: number | null } | undefined>;
  };
};

/**
 * The printings TCGplayer lists a card under, in the order one is taken: the plain card
 * first, then its foil forms. A card here has one row in the collection, so one number.
 */
const PRINTINGS = [
  "normal",
  "holofoil",
  "reverseHolofoil",
  "unlimited",
  "unlimitedHolofoil",
  "1stEdition",
  "1stEditionHolofoil",
];

/**
 * TCGplayer's prices for a set, by printed number, from pokemontcg.io.
 *
 * The second price source, read for every card so each can be priced as the average of the
 * two markets (see blendPrices in price-basis.mjs). One request per set rather than one per
 * card: a search on the set's id with the price fields selected, 250 to a page, paged on
 * the rare set that has more. Fifty-odd requests a day for this collection, well under the
 * keyless limit.
 *
 * pokemontcg.io is slow and flaky: a set's page takes seconds, and now and then answers 502.
 * So the search gets a longer leash than the catalogue's eight seconds and a second try, and a
 * failure is null rather than an empty map: the caller caches an answer for a day, and an
 * outage must not become a day without the second price.
 */
export async function ptcgPrices(setName: string): Promise<Map<string, UsdPrice> | null> {
  /* One budget around the whole thing, not around the paging alone.
     The first version of this deadline covered ptcgSetPrices() and left find() and
     findGallery() outside it — and those read the set's card names, four pages at eight
     seconds each, by exactly the same host that is down. A test that never answers a request
     found it: the call still took the full test timeout. A wall around the outside cannot be
     got round by whichever inner path is slow this week. */
  /* The timer is held and cleared, which the first version did not do: a warm rebuild prices
     about sixty sets, every one of them answered in milliseconds, and every one of them still
     wrote "gave up after 8000ms" eight seconds later. Sixty false alarms in the window you are
     watching for the real ones. */
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pricesFor(setName),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          console.error(
            `pokemontcg.io prices for ${setName} gave up after ${SET_PRICES_BUDGET_MS}ms`,
          );
          resolve(null);
        }, SET_PRICES_BUDGET_MS);
        timer.unref?.();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function pricesFor(setName: string): Promise<Map<string, UsdPrice> | null> {
  // An index that could not be read is not an answer either: null, or an outage of the index
  // would be cached for a day as "nothing to price" for every set asked in it.
  if ((await sets()).size === 0) return null;
  const set = await find(setName);
  // A set pokemontcg.io does not know is an answer: nothing to price, cache that.
  if (!set) return new Map();
  const headers: Record<string, string> = {};
  if (process.env.POKEMONTCG_API_KEY) headers["X-Api-Key"] = process.env.POKEMONTCG_API_KEY;
  // A search that failed is not an answer: null, so the caller keeps yesterday's or asks again.
  /* One budget for the set and its gallery together: two calls, one deadline, so a gallery
     cannot double the wait. */
  const deadline = AbortSignal.timeout(SET_PRICES_BUDGET_MS);
  const own = await ptcgSetPrices(set.id, headers, deadline);
  if (!own) return null;
  // A set's gallery (Trainer Gallery, Galarian Gallery) is a set of its own there and filed under
  // the parent here: its TG/GG numbers are prefixed, so they merge in without a collision.
  const gallery = await findGallery(setName);
  if (gallery) {
    const more = await ptcgSetPrices(gallery.id, headers, deadline);
    if (!more) return null;
    for (const [k, v] of more) if (!own.has(k)) own.set(k, v);
  }
  return own;
}

const SEARCH_TIMEOUT_MS = 12_000;
/**
 * How long the whole of one set's prices may take, pages and retries together.
 *
 * The per-request timeout above is per *request*, and this reads up to four pages with two
 * attempts each: 4 × 2 × 12 s is ninety-seven seconds for one set, and ptcgPrices() can run it
 * twice for a set with a gallery. usdForSet() falls quiet for ten minutes after a failure, but
 * only once it has been told there was one — so a cold instance paid the whole ninety-seven
 * before the brake it already has could come on, and a collection appeared to hang.
 *
 * Eight seconds for the lot. This price is a blend into one Cardmarket already answered; when it
 * does not arrive the card keeps its price and loses a second opinion, which is not worth a
 * minute and a half of somebody's evening.
 */
const budget = Number(process.env.PTCG_PRICES_BUDGET_MS ?? 8_000);
/* Checked rather than trusted: a typo in the Vercel value makes this NaN, setTimeout(NaN) fires
   in a millisecond, and every set would resolve to "no prices" instantly and quietly. */
const SET_PRICES_BUDGET_MS = Number.isFinite(budget) && budget > 0 ? budget : 8_000;

type SearchPage = { data?: (PtcgPriceCard & { number?: string })[]; totalCount?: number };

/** The whole set's prices; null when the search failed, so the caller can fall back. */
async function ptcgSetPrices(
  setId: string,
  headers: Record<string, string>,
  /* One deadline for the whole call, shared by every page and every retry, so the pages
     multiply the wait no further. Passed in, so a set and its gallery share one budget
     rather than each getting its own. */
  deadline: AbortSignal = AbortSignal.timeout(SET_PRICES_BUDGET_MS),
): Promise<Map<string, UsdPrice> | null> {
  const out = new Map<string, UsdPrice>();
  const alias = new Map<string, UsdPrice>();
  for (let page = 1; page <= 4; page++) {
    if (deadline.aborted) return null;
    const url =
      `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(`set.id:${setId}`)}` +
      `&select=id,number,tcgplayer&pageSize=250&page=${page}`;
    let body: SearchPage | null = null;
    for (let attempt = 0; attempt < 2 && !body; attempt++) {
      try {
        const res = await fetch(url, {
          headers,
          next: { revalidate: DAY },
          signal: AbortSignal.any([deadline, AbortSignal.timeout(SEARCH_TIMEOUT_MS)]),
        });
        if (res.ok) body = (await res.json()) as SearchPage;
        else if (res.status < 500) return null;
      } catch {
        // Timed out or the network failed: the next attempt follows.
      }
      // No point sleeping into a deadline that has already passed.
      if (!body && attempt < 1 && !deadline.aborted) await new Promise((r) => setTimeout(r, 500));
    }
    if (!body) return null;
    for (const card of body.data ?? []) {
      if (!card.number) continue;
      const price = usdOf(card);
      if (!price) continue;
      // Under the number as printed, and under its digits alone: a promo is "SWSH282" there and
      // "282" in the collection, "XY150a" and "150A". The printed form wins where both exist, so
      // a gallery card (TG12) never answers for the main set's 12.
      const printed = cardNumber(card.number);
      const digits = printed.replace(/^[A-Z]+/, "").replace(/^0+(?=\d)/, "");
      out.set(printed, price);
      if (digits && digits !== printed && !alias.has(digits)) alias.set(digits, price);
    }
    if ((body.data?.length ?? 0) < 250 || (body.totalCount ?? 0) <= page * 250) break;
  }
  for (const [k, v] of alias) if (!out.has(k)) out.set(k, v);
  return out;
}

function usdOf(card: PtcgPriceCard): UsdPrice | null {
  const prices = card.tcgplayer?.prices ?? {};
  const printing = PRINTINGS.map((p) => prices[p]).find((p) => p && p.market != null);
  if (!printing) return null;
  return {
    market: typeof printing.market === "number" ? printing.market : null,
    low: typeof printing.low === "number" ? printing.low : null,
  };
}
