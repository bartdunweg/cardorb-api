/**
 * Everything the catalogues know about one set, in the shape the collection
 * needs it — and cached where everybody can reach it.
 *
 * This is the expensive half, and the whole point is that none of it is
 * anybody's in particular. Two people who own a Charizard from Obsidian Flames
 * want the same scan, the same id and the same price. Before this, they each
 * paid for it: the walk was memoised per process, so the second person arriving
 * on a warm instance still did the whole set again under their own name. Now
 * the first person to open a set pays for it and everyone after them pays a
 * cache read.
 *
 * The numbers are worth writing down, because they are the argument. A walk of
 * a 1,600-card collection is about 1,650 requests: one for the rows, and the
 * rest facts about cards. Only the first is per-person. Splitting them means a
 * second account costs one query instead of thirteen seconds.
 *
 * Keyed by the *name the collection uses* rather than by a TCGdex id, because
 * resolving one to the other — SET_ALIASES, the subset walk, Trainer Galleries
 * — is itself part of the expensive bit and is the same for everyone too.
 *
 * ── On unstable_cache ──────────────────────────────────────────────────────
 * Next's own docs call it "replaced by `use cache` in Next.js 16", and they are
 * right, but `use cache` needs cacheComponents on and that changes the
 * prerendering model for every page and every GET route in the app. So this is
 * the correct answer for today and a migration for a day when nothing else is
 * moving. An eslint rule keeps the import to this file and collection.ts, which
 * is what makes that migration a two-file change rather than a search.
 *
 * Everything cached here has to survive being serialised into the Data Cache,
 * which is why SetCatalogue holds plain objects where the code it came from
 * held Maps.
 *
 * The raw TCGdex HTTP calls (json, fetchSet, pricesFor) live in
 * tcgdex-client.ts now, re-exported below so nothing importing json/pricesFor
 * from here — cards.ts, and the vi.mock("./catalogue") in
 * collection.test.ts — had to change. What stays here is what decides *which*
 * calls to make and how to fold the answers into a SetCatalogue, plus
 * unstable_cache itself, which this file and collection.ts are the only two
 * allowed to import (see eslint.config.mjs).
 */

import { DAY, mapLimit, catalogueTimeout } from "../util";
import type { Price } from "../price-basis.mjs";
import { unstable_cache } from "next/cache";
import { json, fetchSet, pricesFor } from "./tcgdex-client";
import { resolveSetIds } from "./set-resolve";
import { type CatalogueCard, indexByNumber } from "./set-index";
import { mirrorSetCatalogue } from "./set-catalogue-mirror";
import { setArt } from "./set-art";

export { resolveSetIds } from "./set-resolve";
import type { TcgSet, TcgSetDetail } from "./tcgdex-client";

export { json, pricesFor } from "./tcgdex-client";
export type { TcgSet, TcgCard, TcgSetDetail } from "./tcgdex-client";

export type { CatalogueCard } from "./set-index";

export type SetCatalogue = {
  /**
   * Every form of every localId, lowercased, to the card it names.
   *
   * An object rather than a Map because this goes through the Data Cache and a
   * Map does not survive the trip — it arrives as `{}`, which is an empty index
   * and therefore a set with no artwork at all. The one line of this file most
   * likely to be "tidied" back into a bug.
   */
  byNumber: Record<string, CatalogueCard>;
  assetBase: string | null;
  /**
   * What the catalogue calls this set.
   *
   * Null where nothing matched, and that null is the interesting case: it is a
   * set the catalogues have never heard of, and then the only name anybody has
   * is the one its owner typed.
   */
  officialName: string | null;
  /** The printed abbreviation, for the Limitless guess. */
  code: string | null;
  setHasScans: boolean;
  logo: string | null;
  releaseDate: string | null;
  total: number | null;
  /**
   * tcgId to price, for as much of the set as was worth pricing up front.
   *
   * Empty unless CATALOGUE_SET_PRICING_MAX says otherwise, and that default is
   * deliberate: pricing a whole 300-card set to serve somebody who owns twelve
   * of it costs 300 requests where 12 would have done. It is the right trade
   * once a set has more than one owner and the wrong one before that, so it
   * ships off and gets turned on when the second account exists. Whatever is
   * missing here is fetched per collection instead — see pricesFor().
   */
  prices: Record<string, Price>;
};

/**
 * TCGdex could not be reached, or would not answer for a set it lists: the
 * outage, told apart from every other failure so the collection can be served
 * from the rows alone rather than not at all. See getCollection() in
 * collection/collection.ts, which is what catches it.
 *
 * Matched by name there rather than by instanceof: the error crosses
 * unstable_cache and mapLimit on its way up, and a test that mocks this
 * module does not carry the class.
 */
export class CatalogueUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogueUnavailable";
  }
}

/**
 * The answers from a picture host that mean the file is not there, as opposed to not being
 * handed over just now. 403 is in because object stores answer a missing key that way when
 * listing is denied, which is how TCGdex' CDN is configured.
 */
const GONE = new Set([403, 404, 410]);

/** How big a set may be before pre-pricing it stops being a saving. */
function setPricingMax(): number {
  const raw = Number(process.env.CATALOGUE_SET_PRICING_MAX);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/** The whole of the per-set work, on a cache miss. Exported for its test only. */
export async function loadSetCatalogue(setName: string): Promise<SetCatalogue> {
  // The copy first. It answers for every set the nightly run has been through, which is every
  // set anybody owns a card from, out of one query and with the pictures already checked. Null
  // means the run has not reached this set, and the rest of this function is what that is for.
  const copied = await mirrorSetCatalogue(setName).catch((err) => {
    // A copy that cannot be read is not a set that does not exist: fall through to TCGdex
    // rather than answer a collection with nothing.
    console.error(`Reading ${setName} from the catalogue's copy failed:`, err);
    return null;
  });
  if (copied) return copied;

  // Fetched inside rather than passed in, so a cached catalogue is a complete
  // answer to "tell me about this set" and not half of one. It costs nothing on
  // a miss: the index is one fetch and json() caches it for a day like the rest.
  //
  // The single point of failure for every scan on the page: without the index
  // no set name can be resolved, so one refused request here is the difference
  // between a binder and a wall of empty slots. Hence the retries in json().
  //
  // It used to swallow that failure and carry on without artwork, which was
  // right when the only reader was a page a person could reload. Now the
  // result is cached for a day and every client reads the cache: on
  // 2026-09-02 one 404 from the index during a cold build left sixteen
  // hundred cards without a scan, a price or a catalogue id for every app at
  // once. So a missing index is an error, the build fails, and nothing is
  // cached; the next request tries again.
  let sets: TcgSet[];
  try {
    sets = (await json("https://api.tcgdex.net/v2/en/sets", "sets index")) as TcgSet[];
  } catch (err) {
    throw new CatalogueUnavailable(
      `No TCGdex set index, so no set can be resolved: ${String(err)}`,
    );
  }

  const ids = resolveSetIds(setName, sets);
  // One at a time: the subsets of a set in turn rather than alongside it.
  const details = (await mapLimit(ids, 1, fetchSet)).filter(Boolean) as TcgSetDetail[];
  // The index knows the set and not one of its records could be fetched: that
  // is TCGdex not answering, not a set without cards. fetchSet() fails soft so
  // one gallery can go missing without costing the set, but a catalogue with
  // nothing in it would be cached below for a day — on 2026-09-02 a few
  // minutes of TCGdex being unreachable from the API's region left the newest
  // set without a scan or a catalogue id for every app until the entry aged
  // out. Throwing keeps it out of the cache; the next request tries again.
  if (ids.length > 0 && details.length === 0) {
    throw new CatalogueUnavailable(
      `TCGdex lists ${setName} as ${ids.join(", ")} but answered for none of them; not caching an empty catalogue`,
    );
  }
  // The first is the set itself; the rest are its galleries, which have their
  // own logos and dates and should not be the ones on the heading.
  const detail = details[0] ?? null;

  // Answered, and answered with nothing.
  //
  // The check above catches a set that could not be fetched at all. This is its quieter half:
  // a 200 whose `cards` is missing or empty. Nothing in that answer looks like a failure, so
  // it was cached for a day as "this set has no cards", which is an empty byNumber, which is
  // every card of the set unmatched: no scan, no price, no catalogue id, no Pokedex slot.
  //
  // The index is what says it is wrong. It carries a card count per set, so a set the index
  // counts in the hundreds and the record answers with none is TCGdex contradicting itself,
  // and that is not a fact worth keeping for a day. A set the index counts at zero is a set
  // that has been announced and not filled in yet, and an empty catalogue is then the truth.
  const counted = sets.find((s) => s.id === ids[0])?.cardCount;
  const expected = counted?.total ?? counted?.official ?? 0;
  if (expected > 0 && !details.some((d) => d.cards?.length)) {
    throw new CatalogueUnavailable(
      `TCGdex counts ${expected} cards in ${setName} (${ids.join(", ")}) and answered with none; not caching an empty catalogue`,
    );
  }

  // Where this set keeps its artwork, taken off the logo it already handed over
  // rather than guessed: ".../en/swsh/swsh12.5/logo" minus the logo.
  //
  // The gallery subsets need it. TCGdex lists their cards with an id, a localId
  // and a name and no image at all, so a Galarian Gallery card matched
  // perfectly and then had nothing to build a URL from: Crown Zenith rendered
  // one scan out of 58. The files do exist, filed under the parent set rather
  // than the subset (swsh12.5/GG69, not swsh12.5gg/GG69, which is a 404).
  const assetBase = detail?.logo?.replace(/\/logo$/, "") ?? null;

  // One rule for both sources, in set-index.ts: the set first, its galleries after it.
  const byNumber = indexByNumber(details.map((d) => d.cards ?? []));

  // Only the parent set has a printed abbreviation worth guessing with. The
  // galleries carry theirs as "ASR:TG", which is not a path segment, and
  // Limitless files those cards under the parent's numbering instead. Working
  // out that offset would mean guessing, and an off-by-one there shows a
  // confidently wrong card, so this code is never used for a gallery number.
  //
  // That still holds for Limitless. What has changed since is where those cards
  // come from instead: pokemontcg.io publishes the galleries as sets of their
  // own, addressed by the printed number, so there is no offset to guess there
  // and ptcgScan() picks them up.
  const code = detail?.abbreviation?.official?.split(":")[0]?.toUpperCase() ?? null;

  /**
   * Does this set have scans at all?
   *
   * TCGdex publishes the record before the artwork, and it does not say so:
   * every card in a set that has just been announced still carries an `image`
   * URL, and every one of those URLs is a 404. Pitch Black is 120 of them.
   *
   * The browser used to find that out the hard way, one card at a time, and the
   * 404 of a missing scan carries no cache-control, so each attempt travelled
   * all the way back to origin. That is what made a new set take seconds to
   * fail to paint. One HEAD, here, decides it for the whole set.
   */
  const probe = details.flatMap((d) => d.cards ?? []).find((c) => c.image)?.image;
  let setHasScans = true;
  if (probe) {
    try {
      const res = await fetch(`${probe}/low.webp`, {
        method: "HEAD",
        next: { revalidate: DAY },
        signal: catalogueTimeout(),
      });
      // Only a "there is no such file" is proof of absence. It used to be every answer that
      // was not a 200, so one 502 from the CDN turned a whole set's scans off for a day: on
      // 2026-09-12 set 151 drew 207 empty tiles while every one of those files was being
      // served. A server that is having a bad minute is not a set without artwork, and this
      // decides it for the whole set, so it errs towards asking again.
      setHasScans = res.ok || !GONE.has(res.status);
    } catch {
      // A probe that cannot be made is not proof of absence: assume the scans
      // are there and let the per-card fallback do what it always did.
      setHasScans = true;
    }
  }

  const total = detail?.cardCount?.official ?? detail?.cardCount?.total ?? null;

  // Pre-pricing, when it has been turned on and the set is small enough to be
  // worth it. Off by default; see SetCatalogue.prices.
  const max = setPricingMax();
  let prices: Record<string, Price> = {};
  if (max > 0 && total !== null && total <= max) {
    const ids = [...new Set(Object.values(byNumber).map((c) => c.id))];
    // The normal printing only. This Record has one slot per card and the foil
    // price needs a second, which is a wider change than this one — see
    // holoOfId() in cards.ts, where a pre-priced card therefore falls back to
    // the normal price for its foil. Invisible while pre-pricing is off, which
    // it is by default.
    prices = Object.fromEntries(
      [...(await pricesFor(ids))].flatMap(([id, p]) => (p.price ? [[id, p.price] as const] : [])),
    );
  }

  return {
    byNumber,
    assetBase,
    officialName: detail?.name ?? null,
    code,
    setHasScans,
    logo: await setArt(
      setName,
      detail?.logo ? `${detail.logo}.webp` : null,
      detail?.symbol ? `${detail.symbol}.webp` : null,
    ),
    releaseDate: detail?.releaseDate ?? null,
    total,
    prices,
  };
}

/**
 * The cached front door. One entry per set name, a day old at most.
 *
 * unstable_cache keys on the arguments as well as on keyParts, so this is
 * per-set without saying so. The "v1" is a manual bust for when SetCatalogue's
 * shape changes and the entries on disk stop meaning what they say — bump it in
 * the same commit as the shape, or the first deploy reads yesterday's fields
 * into today's type and finds undefined where it expected a string.
 */
// v6: a set the nightly copy holds is answered from Postgres now (set-catalogue-mirror.ts), and
// the entries on disk were all built from TCGdex. They are not wrong, so this is not a repair;
// it is so the change is true from the first request rather than from tomorrow.
// v5: the two rules above changed which answers are allowed to become an entry, and the entries
// already on disk were written under the old ones. Any set poisoned by a bad answer today would
// otherwise keep its emptiness for the rest of its day; under a new key nothing looks at them.
// v4: #230 changed what an entry contains — five promo aliases, and resolveSetIds now takes the
// longest overlap and requires a shared id prefix. The key stayed at v3, so for a whole day every
// set already in the Data Cache kept a byNumber built by the old rule.
export const setCatalogue = unstable_cache(loadSetCatalogue, ["set-catalogue", "v6"], {
  revalidate: DAY,
  tags: ["catalogue"],
});
