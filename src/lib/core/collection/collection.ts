/**
 * The collection, for one person.
 *
 * Two jobs that used to sit inside cards.ts and belong outside it: asking the
 * store for the rows, and deciding how long the answer is allowed to stand.
 * Neither is about matching cards against catalogues, and both are questions
 * with a "whose" in them.
 *
 * ── What this replaced, and why it had to go ───────────────────────────────
 *
 * There was a module-level slot here: `let collection: Promise<CardSet[]>`,
 * with a ten-minute TTL and a forgetCollection() to clear it. It was the right
 * answer to a real problem — the detail route asks for the collection three
 * times in a render and the build rendered 1,622 of those pages — and it was
 * right for exactly as long as there was one collection.
 *
 * A slot per process is a slot the next request inherits. The moment a second
 * person can sign in, the next request is somebody else, and a warm instance
 * hands them the first person's binder: on /cards, on /v1/collection, on every
 * /cards/[id], and into the ISR entry of whatever page rendered first. That is
 * not a performance bug with a correctness edge case, it is a disclosure bug,
 * and it was killed here — before accounts exist — rather than in the change
 * that would have introduced the second person.
 *
 * What replaces it is two caches with honest scopes. React's cache() is per
 * request by construction, so it cannot be inherited by anyone; it does the job
 * the slot did inside a single render. unstable_cache is keyed by who is
 * asking, so it does the job across requests without ever answering one
 * person's question with another's data.
 *
 * The expensive half went somewhere else entirely: see lib/core/catalogue/catalogue.ts,
 * where the facts about cards — the same for everybody — are cached once and
 * shared. What is left here is a database read and an in-memory join.
 */

import { cache } from "react";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import {
  buildCollection,
  type CardIdentity,
  type CardSet,
  type FactsGroup,
  type SetFacts,
  identityKey,
  resolveSetFacts,
} from "./cards";
import { DAY, mapLimit } from "../util";
import { blendPrices, priceFromUsd } from "../price-basis.mjs";
import { fetchUsdToEur } from "../catalogue/rates";
import { elapsed, logTiming, timed, timedCache } from "../timing";
import { fetchPriceGuide, guidePrices } from "../catalogue/price-guide";
import { pricesFor, usdFor, type CardPrices, type UsdPair } from "../catalogue/tcgdex-client";
import type { ProductIds } from "./snapshot";
import IDS from "../cardmarket-ids.generated.json";
import RUN_IDS from "../cardmarket-ids.editions.generated.json";
import IDS_JA from "../cardmarket-ids.ja.generated.json";
import IDS_KO from "../cardmarket-ids.ko.generated.json";
import IDS_ZH_CN from "../cardmarket-ids.zh-cn.generated.json";
import IDS_ZH_TW from "../cardmarket-ids.zh-tw.generated.json";
import type { BrowseLanguage } from "../catalogue/tcgdex-browse";
import { cardsTag, foldersTag, type CollectionRow } from "./collection-row";
import { valueHistoryTag, type ValueSnapshot } from "./value-snapshot";
import { cardsVersion, listRows, listSnapshots, publicProfile } from "../../storage/collection";
import {
  getFolder,
  listCardPrices,
  listFolders,
  listPublicFolders,
  type Folder,
} from "../../storage/postgres";
import type { CardPricePoint } from "./movers";
import type { PublicProfile } from "../../storage/postgres";
import { adminClient, serverClient, userClient } from "../../storage/supabase";

export type { ValueSnapshot } from "./value-snapshot";
export { valueHistoryTag } from "./value-snapshot";

/**
 * The rows, cached across requests, dropped the moment their owner writes.
 *
 * An hour, matching what the Notion fetch was already tagged with, because a
 * collection changes when a pack is opened rather than by the minute.
 *
 * The userId goes to the *query* as well as to the key, and the first version
 * of this passed it only to the key. That is worth writing down because of how
 * it failed: row level security allowed the read, correctly — the policy that
 * lets a public profile be read by strangers is the same policy a signed-in
 * stranger is judged by — so a brand new account asking for its own empty
 * collection was handed the public one instead, 1,645 cards that were not
 * theirs. RLS is the wall against seeing what is private; it is not a
 * substitute for the application saying whose collection it wants.
 *
 * The call is deliberately *inside* here and the try/catch deliberately
 * outside: a store that is down should not have its outage written into the
 * cache as "this person owns nothing". The old code went to some length to
 * avoid memoising a failure and the same care is wanted here — worth
 * re-checking against Next's behaviour if this ever starts serving stale
 * empties after an incident.
 *
 * `db` is resolved by the caller (getCards(), below) and only ever closed
 * over here, never built here: unstable_cache refuses cookies() inside its
 * own callback, so a cookie-bound client has to exist before this function is
 * entered. It is safe to close over regardless of how it was built, because
 * the cache key is `userId` alone — on a hit this closure never runs, and on
 * a miss the client is used once, for the one read that fills the cache with
 * plain data that carries no session of its own.
 */
const cachedRows = async (userId: string, db: SupabaseClient | null) => {
  // The store's count of writes to this person's cards, read before the rows and put in the
  // key. The tag alone was a race: a read begun before a write finished after it and stored
  // the rows from before under a tag the write had just dropped, and the list said ×4 behind
  // a sheet saying 2 for an hour (cardorb-web #360). Under a version, that late read stores
  // where nothing looks again. A store that cannot say (no migration yet, or a refused
  // profile read) leaves the key as it was and the tag doing what it can.
  const version = await timed("store cardsVersion", () =>
    Promise.resolve()
      .then(() => cardsVersion(userId, db))
      .catch(() => null),
  );
  return timedCache("cache rows", (ran) =>
    unstable_cache(
      () => {
        ran();
        return timed("store listRows", () => listRows(userId, db));
      },
      // The shape version belongs here too: #234 added foilPattern to what toRow builds, and
      // without a version part there was no way to say so — every cached row kept the shape it
      // had before.
      ["collection-rows", "v2", userId, version === null ? "-" : String(version)],
      { revalidate: 3600, tags: [cardsTag(userId)] },
    )(),
  );
};

/**
 * The collection, assembled, cached across requests under the same tag as the
 * rows it is built from.
 *
 * buildCollection() is a pure function of cachedRows() and setCatalogue() — both
 * already cached — but was, until this, re-run in full on every request: every
 * page under app/(app)/layout.tsx (force-dynamic) calls getCards() on every
 * navigation, and so do the public API routes. React's cache() on getCards only
 * dedupes within one render, so none of that repetition was ever avoided across
 * requests. The rebuild itself walks every row doing Levenshtein matching
 * (sameCard) and a linear species scan (speciesOf) per card — the same cost
 * that was fixed client-side in cards-stats.ts, still paid server-side, per
 * request. This is what showed up as Vercel's Fluid CPU total.
 *
 * Sharing cardsTag(userId) with cachedRows() means the four write routes that
 * already revalidate that tag on a mutation invalidate this too, for free —
 * no separate invalidation path needed. revalidate matches cachedRows()'s TTL:
 * the assembled collection can never be fresher than the rows it is built from.
 */
/**
 * Every mapped card's price from Cardmarket's guide, as one plain object,
 * cached a day. The guide itself is fourteen megabytes and cannot sit in the
 * data cache; what it says about the cards this deployment knows a product id
 * for can, in shards (cachedGuidePrices below).
 */
export const PRICE_GUIDE_TAG = "price-guide";

/**
 * The committed id maps, one per catalogue. The ids are not unique between them — SM1S is a set
 * in Japanese and in Korean, and SM1S-001 is a different card in each — so they cannot be one
 * map, and each is cached on its own. Built by scripts/language-cardmarket-ids.mjs.
 */
const LANGUAGE_IDS: Record<BrowseLanguage, ProductIds> = {
  ja: IDS_JA as ProductIds,
  ko: IDS_KO as ProductIds,
  "zh-cn": IDS_ZH_CN as ProductIds,
  "zh-tw": IDS_ZH_TW as ProductIds,
};

/** The id map of one catalogue; English is the one without a language in its file name. */
export const productIdsOf = (language: BrowseLanguage | null): ProductIds =>
  language ? LANGUAGE_IDS[language] : (IDS as ProductIds);

/**
 * How many entries one catalogue's prices are cached in.
 *
 * A data cache entry holds two megabytes at most. A priced card is about 140 bytes of JSON, so
 * one entry holds fourteen thousand of them: the English shelf, whole since 2026-09-11, is
 * twenty-three thousand cards and would not fit — and an entry over the ceiling is not cached at
 * all, which is the fourteen-megabyte guide downloaded on every set page. Four shards keep the
 * biggest catalogue well under a megabyte each, with room for the shelves to grow.
 */
const GUIDE_SHARDS = 4;

/** Which shard an id lives in: a stable hash, so the same card is in the same entry every day. */
const shardOf = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % GUIDE_SHARDS;
};

/**
 * The guide, downloaded once per request however many shards are cold at the same time. The
 * shards are read in parallel and each of the cold ones would fetch its own fourteen megabytes;
 * React's cache() makes those one download. Outside the shard's cache callback on purpose: a
 * function memoised inside one would be memoised per shard.
 */
const guideForShards = cache(() => fetchPriceGuide());

/**
 * One catalogue's prices, cached a day, in a few entries under one tag.
 *
 * Per catalogue rather than all of them in one entry, for the reason above: the ids collide
 * between catalogues. And in shards rather than one entry per catalogue, for the size reason
 * on GUIDE_SHARDS. Every shard is read on every call — a set page's cards hash to all four —
 * and merged into the one plain object the callers have always had.
 */
const cachedGuidePrices = async (
  language: BrowseLanguage | null = null,
): Promise<Record<string, CardPrices>> => {
  const map = productIdsOf(language);
  const byShard: string[][] = Array.from({ length: GUIDE_SHARDS }, () => []);
  for (const id of Object.keys(map)) byShard[shardOf(id)]?.push(id);
  const shards = await Promise.all(
    byShard.map((ids, shard) =>
      timedCache(`cache guide-prices ${language ?? "en"}/${shard}`, (ran) =>
        unstable_cache(
          async (): Promise<Record<string, CardPrices>> => {
            ran();
            // The whole map, so the read stays what it was: which map is the fact under test.
            // The run products only for English: Cardmarket prices no run of the other shelves,
            // and the ids do not mean the same thing between catalogues.
            return Object.fromEntries(
              guidePrices(ids, await guideForShards(), map, language ? {} : RUN_IDS),
            );
          },
          // v11: the entries now carry the Shadowless run's figure, and a cached v10 entry does
          // not (the Data Cache outlives a deploy, so a bump is the only way to be sure).
          ["guide-prices", language ?? "en", "v11", String(shard)],
          { revalidate: 86_400, tags: [PRICE_GUIDE_TAG] },
        )(),
      ),
    ),
  );
  return Object.assign({}, ...shards);
};

/**
 * The guide first, TCGdex for what the guide does not know — a card added
 * before the id mapping learned it. If the guide is unreachable the whole
 * list goes to TCGdex, which is slow but was the only path until today.
 */
export async function pricesFromGuideThenTcgdex(ids: string[]): Promise<Map<string, CardPrices>> {
  return guideThenTcgdex(ids, await guideForRequest());
}

/**
 * The guide's map, once per request, read at the top level. Read from inside
 * a cache callback it is not read at all: Next runs an unstable_cache nested
 * in another uncached, "similar to fetches", and the fourteen-megabyte guide
 * was being downloaded once per set on every rebuild. Fails soft to an empty
 * map, which sends every card to TCGdex, the path that was the only one once.
 */
const guideForRequest = cache(
  async (language: BrowseLanguage | null = null): Promise<Record<string, CardPrices>> => {
    try {
      return await cachedGuidePrices(language);
    } catch (err) {
      console.error("Price guide unavailable, pricing card by card:", err);
      return {};
    }
  },
);

/**
 * The guide's prices for these cards and nothing else — no TCGdex fallback.
 *
 * For a browse surface, where the cards are the catalogue's rather than the viewer's: a set page
 * asks after up to 250 cards at once and most of a big set is unpriced by Cardmarket, so the
 * fallback would be hundreds of requests to put a number under cards nobody is buying. A missing
 * price on a set page is a blank line; a set page that takes ten seconds is a broken one.
 */
export const guidePricesFor = async (
  ids: string[],
  /** Which catalogue the ids are from. A Japanese set page prices from the Japanese map. */
  language: BrowseLanguage | null = null,
): Promise<Map<string, CardPrices>> => {
  const known = await guideForRequest(language);
  const out = new Map<string, CardPrices>();
  for (const id of ids) {
    const found = known[id];
    if (found) out.set(id, found);
  }
  return out;
};

function guideThenTcgdex(
  ids: string[],
  known: Record<string, CardPrices>,
): Promise<Map<string, CardPrices>> {
  return tcgdexForMissing(ids, known);
}

async function tcgdexForMissing(
  ids: string[],
  known: Record<string, CardPrices>,
): Promise<Map<string, CardPrices>> {
  const out = new Map<string, CardPrices>();
  const missing: string[] = [];
  for (const id of ids) {
    const hit = known[id];
    if (hit) out.set(id, hit);
    else missing.push(id);
  }
  if (missing.length) {
    const fetched = await timed(
      "tcgdex pricesFor",
      () => pricesFor(missing),
      `${missing.length} cards`,
    );
    for (const [id, p] of fetched) out.set(id, p);
  }
  return out;
}

/**
 * The person's folders, cached an hour under their own tag. `/v1/cards?collection=` reads
 * them to learn whether the id is a rule folder; every folder write revalidates the tag, so
 * the next read sees the new rule. Same client-outside-the-cache pattern as cachedRows().
 */
const cachedFolders = (userId: string, db: SupabaseClient | null) =>
  unstable_cache(() => (db ? listFolders(db, userId) : Promise.resolve([])), ["folders", userId], {
    revalidate: 3600,
    tags: [foldersTag(userId)],
  })();

/**
 * The folders one person shows on their public profile, for a visitor.
 *
 * Through the service role, like the public collection: the visitor has no account to act
 * as, and the anonymous role may not read this table at all. The store scopes the read to the
 * one owner and to public rows. Cached an hour under the owner's folders tag, so a folder made
 * public shows on the next request; and an owner whose profile is private is never asked for
 * (ownerOf() answers null first, in every public route).
 */
const cachedPublicFolders = (userId: string, db: SupabaseClient) =>
  unstable_cache(() => listPublicFolders(db, userId), ["public-folders", userId], {
    revalidate: 3600,
    tags: [foldersTag(userId)],
  })();

export const getPublicFolders = cache(async (userId: string): Promise<Folder[]> => {
  const db = adminClient();
  if (!db) return [];
  return cachedPublicFolders(userId, db);
});

export const getFolders = cache(async (userId: string, token?: string): Promise<Folder[]> => {
  const db = token ? userClient(token) : await serverClient();
  return cachedFolders(userId, db);
});

/**
 * One folder by id: the cached list first, the store on a miss. A folder made a moment ago can
 * be missing from the list for the second it takes a revalidated tag to reach every instance,
 * and the client that made it asks for its cards right away. The store read costs a query only
 * on that miss, or for an id that is no folder at all.
 */
export const findFolder = cache(
  async (userId: string, id: string, token?: string): Promise<Folder | null> => {
    const listed = (await getFolders(userId, token)).find((f) => f.id === id);
    if (listed) return listed;
    const db = token ? userClient(token) : await serverClient();
    return db ? getFolder(db, userId, id) : null;
  },
);

/**
 * What the catalogues say about one set's printings, kept a day.
 *
 * The rebuild after a write used to be twenty seconds for this collection, and
 * almost none of it was about the write: a star on one card dropped the whole
 * assembly, and the next read matched every printing against the set
 * catalogue again, probed two more catalogues for every card without a scan,
 * and asked TCGdex the price of every card the guide does not know. Those are
 * facts about cards, the same whoever owns them, so they are cached here as
 * such — under the catalogue's tag, never under the person's — and a write
 * costs the rows and the join.
 *
 * Keyed by the set and by *which* printings are asked about, in one order
 * (setIdentities), so the same set with a card added is a new entry and the
 * same rows starred, counted or noted are the old one. A signature rather than
 * the list itself: the key is part of every read, and a hundred identities
 * would put kilobytes in it.
 *
 * A day, like the set catalogue and the price guide this reads through; a
 * price moves once a night. Not keyed by user: the entry carries no row, no
 * copy, nothing anyone owns.
 *
 * Called at the top level of a request, never from inside another cache's
 * callback. Next runs a nested unstable_cache uncached — "similar to fetches"
 * — and the first version of this sat inside the hour-long collection entry,
 * where every one of its fifty-two reads was a miss on every write; so was
 * the set catalogue's, which is why the old rebuild fetched every set from
 * TCGdex again each time. On a miss here the set catalogue read *is* nested
 * and goes to TCGdex; a miss is once a day per set, or a card added to one.
 */
const factsSignature = (identities: CardIdentity[]): string =>
  createHash("sha1").update(identities.map(identityKey).join("\u0001")).digest("hex");

/**
 * Every set's facts for one person, in one Data Cache entry.
 *
 * The per-set entries below stay: they are the source of truth, a day old at most, and a card
 * added to one set costs that set alone. What they are not is cheap to read a hundred of. On
 * production on 2026-09-12 a set-facts hit was a median of 16 ms and a tcgplayer hit 15, so a
 * fifty-two set collection paid a hundred and two reads and a megabyte over the network before
 * anything was drawn: 5 to 9 seconds measured, where the same walk against a local cache is
 * 0.16. This entry is that hundred and two collapsed into one.
 *
 * On a miss it reads them, so a miss costs what every request used to. The key carries every
 * group and the printings asked of it, so a card added anywhere makes a new entry rather than a
 * stale one, and the dollar rate too, since the prices inside were blended at it.
 *
 * Tagged `catalogue` like the entries it holds, so the nightly sync drops all of it together.
 */
const bundleSignature = (groups: FactsGroup[], usdToEur: number | null): string =>
  createHash("sha1")
    .update(groups.map((g) => `${g.key}\u0002${factsSignature(g.identities)}`).join("\u0001"))
    .update(`\u0003${usdToEur ?? "-"}`)
    .digest("hex");

const cachedFactsBundle = (
  userId: string,
  groups: FactsGroup[],
  priceSource: (ids: string[]) => Promise<Map<string, CardPrices>>,
  usdToEur: number | null,
): Promise<Record<string, SetFacts>> =>
  timedCache(`cache collection-facts`, (ran) =>
    unstable_cache(
      async () => {
        ran();
        const entries = await mapLimit(groups, 6, async (g) => {
          const facts = await factsWithUsd(g.setName, g.identities, priceSource, usdToEur);
          return [g.key, facts] as const;
        });
        // A plain object: a Map arrives from the Data Cache as `{}`, which here would be a
        // collection with no artwork and no prices. The same line guide-prices draws.
        const bundle = Object.fromEntries(entries);
        /*
         * Said out loud, because the ceiling is silent.
         *
         * A Data Cache entry holds two megabytes and one over it is not cached at all, with no
         * error and no warning: the fourteen-megabyte price guide was downloaded on every set
         * page for exactly that reason before it was sharded. This entry grows with the
         * collection, so the size goes in the log on every miss: 631,162 bytes across 53 groups
         * on 2026-09-12, under a third of the ceiling. If it approaches it,
         * shard it by group the way guide-prices is sharded, and the reason will be on record
         * rather than guessed at.
         */
        console.info(
          `[size] collection-facts ${JSON.stringify(bundle).length} bytes across ${groups.length} groups`,
        );
        return bundle;
      },
      ["collection-facts", "v1", userId, bundleSignature(groups, usdToEur)],
      { revalidate: DAY, tags: ["catalogue"] },
    )(),
  );

const cachedSetFacts = (
  setName: string,
  identities: CardIdentity[],
  priceSource: (ids: string[]) => Promise<Map<string, CardPrices>>,
) =>
  timedCache(`cache set-facts ${setName}`, (ran) =>
    unstable_cache(
      () => {
        ran();
        return resolveSetFacts(setName, identities, { priceSource });
      },
      // v18: base1-55 (Nidoran♂) linked by hand, the same way as v17.
      //
      // v17: #299 relinked two Cardmarket products (Nidoran♀ Jungle 57, Pikachu EX XY124), and
      // the price a set entry holds was read when the entry was made. Under v16 both cards
      // stayed unpriced after the deploy, for a day, per set — the guide key moved and this
      // one did not.
      //
      // v16: a card from a catalogue that is not the English one resolves here now, and
      // CardFacts grew `rarity` and `catalogue` for it. An entry cached under v15 is a
      // SetFacts without either — which for a Japanese card means no rarity and, worse, a
      // `catalogue` of undefined, which factsWithUsd() below would read as an English card
      // and hand a dollar price meant for whatever English card holds that number.
      //
      // v15: #238 added `abbreviation` to what this resolves, and left the key alone. Every
      // entry cached under v14 is a SetFacts without the field, so `setAbbr` reached the web
      // as null and every tile went on writing its set out in full — for a day, per set,
      // silently. Measured on production: TCGdex answers "PBL" for Pitch Black and the
      // collection still said null.
      //
      // v14: the scan fixes of 2026-09-07 (#232, #233, and the paging one after them) each
      // change what this resolves to for a card TCGdex has no picture of, and yesterday's
      // answer would have stood for a day — fourteen cards here kept their empty square
      // through a deploy that had already fixed them.
      ["set-facts", "v18", setName, factsSignature(identities)],
      { revalidate: DAY, tags: ["catalogue"] },
    )(),
  );

/**
 * TCGplayer's prices for a set's cards, a day at a time, from TCGdex.
 *
 * pokemontcg.io used to be asked per set, behind a quiet period and a per-instance
 * last-good answer, and by 2026-09-11 it answered one set in eight: the same card
 * blended two markets on one instance and stood on Cardmarket alone on the next.
 * TCGdex relays TCGplayer's number on every card's own record (usdFor), the read
 * pricesFor() already makes for a card the guide does not price.
 *
 * Keyed by the set and the cards asked for, so a set that gains a card is asked
 * again. A read that answered for nothing throws, so an outage is not kept for a
 * day; the caller reads Cardmarket alone for that request and asks again on the
 * next. An object rather than a Map: a Map does not survive the Data Cache.
 */
const cachedTcgdexUsd = (setName: string, ids: string[]) =>
  timedCache(`cache tcgplayer ${setName}`, (ran) =>
    unstable_cache(
      async (): Promise<Record<string, UsdPair>> => {
        ran();
        return Object.fromEntries(await usdFor(ids));
      },
      // v2: the answer is both runs now, not one figure. An entry written by the version
      // before this holds a bare UsdPrice and would read as a pair with neither run in it.
      ["tcgdex-usd", "v2", setName, createHash("sha1").update(ids.join("\u0001")).digest("hex")],
      { revalidate: DAY, tags: ["catalogue"] },
    )(),
  );

/** Exported for its test rather than for any caller: the rule is about money. */
export const usdForSet = async (
  setName: string,
  ids: string[],
): Promise<Record<string, UsdPair>> => {
  if (!ids.length) return {};
  try {
    return await cachedTcgdexUsd(setName, ids);
  } catch (err) {
    console.error(`TCGplayer prices unavailable for ${setName}, Cardmarket's alone for now:`, err);
    return {};
  }
};

/** The set's facts with the second market blended into every price, where the rate allows. */
async function factsWithUsd(
  setName: string,
  identities: CardIdentity[],
  priceSource: (ids: string[]) => Promise<Map<string, CardPrices>>,
  usdToEur: number | null,
) {
  const facts = await cachedSetFacts(setName, identities, priceSource);
  if (usdToEur == null) return facts;
  /* Only the English cards, by their TCGdex id: a card from its own catalogue keeps
     Cardmarket's figure alone, since there is no TCGplayer price for a Japanese printing.
     A card whose facts already carry the dollar figure — priced by TCGdex because the guide
     had nothing — is not asked for twice. */
  const wanted = Object.values(facts.cards).flatMap((f) =>
    !f.catalogue && f.tcgId && !f.usd ? [f.tcgId] : [],
  );
  const usd = await usdForSet(setName, [...new Set(wanted)]);
  const cards = Object.fromEntries(
    Object.entries(facts.cards).map(([key, f]) => {
      if (f.catalogue) return [key, f];
      const fetched = f.tcgId ? usd[f.tcgId] : null;
      const p = f.usd ?? fetched?.usd ?? null;
      /*
       * The stamped run's figure is not blended with Cardmarket's.
       *
       * Every other price here is the average of the two markets, which works because both
       * describe the same product. They do not here: Cardmarket publishes one figure per card
       * id and it is the ordinary run's, so averaging it with the stamped run's dollars would
       * give a number that is neither run's. TCGplayer alone, converted, or nothing.
       */
      const first = f.usdFirstEd ?? fetched?.firstEd ?? null;
      return [
        key,
        {
          ...f,
          price: blendPrices(f.price, p ? priceFromUsd(p, usdToEur) : null),
          priceFirstEd: first ? priceFromUsd(first, usdToEur) : null,
        },
      ];
    }),
  );
  return { ...facts, cards };
}

/**
 * The day's dollar rate, once per request and a day across them, read at the top level
 * like the guide: inside a set's facts callback it would be fetched again per set. Null
 * keeps every TCGplayer price out rather than showing one at a guessed rate.
 */
const cachedUsdToEur = () =>
  timedCache("cache usd-eur", (ran) =>
    unstable_cache(
      () => {
        ran();
        return fetchUsdToEur();
      },
      ["usd-eur"],
      { revalidate: DAY, tags: ["catalogue"] },
    )(),
  );

const usdToEurForRequest = cache(async (): Promise<number | null> => {
  try {
    return await cachedUsdToEur();
  } catch (err) {
    console.error("Dollar rate unavailable, TCGplayer prices withheld:", err);
    return null;
  }
});

/**
 * The collection, put together for this request: the rows from their cache,
 * the guide from its, one entry of facts per set from theirs, and the join.
 *
 * Not cached across requests as a whole any more. The hour-long entry that
 * did that was the reason nothing under it was ever cached (see above), so a
 * warm read was one cache read and a read after a write was the whole world
 * again. Now a read is a handful of cache reads at once and a join in memory,
 * warm or not, and a write moves only the rows. React's cache() on the two
 * callers keeps it to once per request.
 */
async function assemble(userId: string, db: SupabaseClient | null): Promise<CardSet[]> {
  const rows = await cachedRows(userId, db);
  const [known, usdToEur] = await Promise.all([guideForRequest(), usdToEurForRequest()]);
  // The same rows, guide and rate on the same instance within minutes: the same sets. A write
  // changes the rows (their cache is dropped by tag), so the key changes and the join runs
  // again; /folders, /stats and /cards on one screen, or the Pokédex's read after the count's,
  // do not each pay the ~100 cache reads and the join over two thousand rows.
  const key = `${userId}:${rowsVersion(rows)}:${Object.keys(known).length}:${usdToEur ?? "-"}`;
  const kept = assembled.get(key);
  if (kept && kept.until > Date.now()) {
    logTiming("cache assemble hit", 0, `${rows.length} rows`);
    return kept.sets;
  }
  const priceSource = (ids: string[]) => guideThenTcgdex(ids, known);
  const start = performance.now();
  const sets = await buildCollection(rows, {
    factsSource: (setName, identities) => factsWithUsd(setName, identities, priceSource, usdToEur),
    factsBundle: (groups) => cachedFactsBundle(userId, groups, priceSource, usdToEur),
  });
  logTiming("buildCollection", elapsed(start), `${rows.length} rows ${sets.length} sets`);
  remember(key, sets);
  return sets;
}

/**
 * The assembled collections this instance has seen lately, by rows version. Ten minutes and a
 * handful of entries: the facts and prices under them are a day old at most anyway, and an
 * instance serves one collector's screens at a time. Not the Data Cache: a whole-collection
 * entry there was the nested cache that hid every cache under it (see above).
 */
/**
 * The assembled collection for a cron that holds the admin client rather than a
 * person's session: the same join, memo and blended prices as every request,
 * so what the night writes is what the day shows.
 */
export const assembleFor = (userId: string, db: SupabaseClient): Promise<CardSet[]> =>
  assemble(userId, db);

const assembled = new Map<string, { sets: CardSet[]; until: number }>();
const ASSEMBLED_TTL_MS = 10 * 60_000;
const ASSEMBLED_MAX = 8;

function remember(key: string, sets: CardSet[]) {
  assembled.set(key, { sets, until: Date.now() + ASSEMBLED_TTL_MS });
  while (assembled.size > ASSEMBLED_MAX) {
    const oldest = assembled.keys().next().value;
    if (oldest === undefined) break;
    assembled.delete(oldest);
  }
}

/** What of the rows the join reads: their ids, their inventory fields and when they changed. */
function rowsVersion(rows: CollectionRow[]): string {
  const hash = createHash("sha1");
  for (const r of rows) {
    hash.update(
      `${r.id}|${r.owned}|${r.quantity}|${r.finish}|${r.foilPattern}|${r.isFavorite}|${r.collectionId}|${r.excluded}|${r.rarity}|${r.name}|${r.setName}|${r.number}|${r.condition}|${r.grade}|${r.purchasePrice}|${r.purchaseDate}|${r.notes}|${r.acquiredAt}\u0001`,
    );
  }
  return hash.digest("hex");
}

/**
 * The collection, built.
 *
 * `token`, when given, is the caller's own bearer credential — an API route
 * serving curl or the iOS app rather than a page render. Left out, this is a
 * page holding a cookie session. Either way the client is resolved here,
 * before cachedRows() is entered, for the reason on that function's own
 * comment: row level security needs to see the caller who is actually asking,
 * and finding out too late — inside a cache that cannot ask cookies() the
 * question — is how a private collection came back empty to its own owner.
 *
 * Fails soft, like everything else that faces a page: a store outage or a
 * catalogue that refuses three times in a row renders an empty state and says
 * so, rather than taking the route down. The empty lasts one render — nothing
 * here remembers it — so the next request tries again and finds most of the
 * work already in a cache.
 *
 * `failed` is what tells those two empties apart. They were the same value for
 * as long as there was one account with sixteen hundred cards in it, and the
 * screen said the collection was unavailable — which was right for an outage
 * and, once accounts could be new, was the first sentence a new account read
 * about its own empty collection. The distinction is here rather than guessed
 * at by the caller because here is the only place that knows.
 */
export type Collection = {
  sets: CardSet[];
  failed: boolean;
  /**
   * Present only when TCGdex could not be reached: the sets are the rows alone,
   * without a scan, a catalogue id or a price, and nothing has cached them.
   */
  catalogueUnavailable?: true;
};

/**
 * TCGdex is down, not the store. A `CatalogueUnavailable` thrown by
 * loadSetCatalogue(), matched by name because it has crossed unstable_cache
 * and mapLimit on its way here, and because a test that mocks the catalogue
 * module does not carry the class.
 */
const isCatalogueOutage = (err: unknown): boolean =>
  err instanceof Error && err.name === "CatalogueUnavailable";

/**
 * The rows without the catalogue, for the duration of an outage.
 *
 * Built afresh on every request and cached nowhere: the hour-long entry is
 * the whole collection, and an entry with no scans, ids or prices in it would
 * be served for an hour after TCGdex came back (which is what happened once,
 * see loadSetCatalogue()). The rows themselves are still the cached ones, so
 * this costs the assembly and no round trip.
 */
const offlineCollection = async (
  userId: string,
  db: SupabaseClient | null,
): Promise<Collection> => ({
  sets: await buildCollection(await cachedRows(userId, db), { offline: true }),
  failed: false,
  catalogueUnavailable: true,
});

export const getCollection = cache(async (userId: string, token?: string): Promise<Collection> => {
  let db: SupabaseClient | null = null;
  try {
    db = token ? userClient(token) : await serverClient();
    return { sets: await assemble(userId, db), failed: false };
  } catch (err) {
    if (isCatalogueOutage(err)) {
      console.error("Catalogue unreachable, serving the rows without it:", err);
      try {
        return await offlineCollection(userId, db);
      } catch (inner) {
        console.error("Card collection walk failed, retrying on the next render:", inner);
        return { sets: [], failed: true };
      }
    }
    console.error("Card collection walk failed, retrying on the next render:", err);
    return { sets: [], failed: true };
  }
});

/**
 * The rows themselves, joined to nothing.
 *
 * For the callers that want to know what somebody owns without wanting the
 * collection built: browse marks a page of catalogue cards owned or not, which
 * is one boolean per card and needs the name, number and set of every row and
 * nothing else. Going through getCards() to get there would resolve artwork,
 * prices and species for sixteen hundred rows against three catalogues to
 * answer it — exactly the per-request cost this cache exists to stop paying.
 *
 * The same client resolution and the same soft failure as getCollection(),
 * deliberately: a store outage on a browse screen should cost the ownership
 * marks, not the catalogue behind them. `failed` is here for the same reason it
 * is there — a collection with nothing in it and a collection that could not be
 * read are different sentences.
 */
export const getRows = cache(
  async (userId: string, token?: string): Promise<{ rows: CollectionRow[]; failed: boolean }> => {
    try {
      const db = token ? userClient(token) : await serverClient();
      return { rows: await cachedRows(userId, db), failed: false };
    } catch (err) {
      console.error("Collection rows unavailable, retrying on the next render:", err);
      return { rows: [], failed: true };
    }
  },
);

/**
 * The collection alone, for the callers that have nothing different to say
 * about an outage — every API route, which answers with a list either way.
 */
export const getCards = async (userId: string, token?: string): Promise<CardSet[]> =>
  (await getCollection(userId, token)).sets;

/**
 * A public profile's collection, read for a stranger.
 *
 * The stranger has no account, so there is nobody this could act as — which is
 * the one condition under which the service role is the right client (see
 * adminClient()). The anonymous role is not: since the web app's schema review
 * it may read only the public columns of `cards`, and a walk that selects the
 * full row as anon is refused outright, which this API then answered with an
 * empty collection for an hour of CDN cache. The read is scoped to the one
 * owner, whom ownerOf() has already found public, and forPublic() strips every
 * private field before anything leaves.
 *
 * `failed` is handed back rather than swallowed: a public answer is cached at
 * the CDN, and an empty collection cached for an hour is worse than a 503.
 */
export const getPublicCollection = cache(async (userId: string): Promise<Collection> => {
  const db = adminClient();
  if (!db) return { sets: [], failed: true };
  try {
    return { sets: await assemble(userId, db), failed: false };
  } catch (err) {
    if (isCatalogueOutage(err)) {
      console.error("Catalogue unreachable, serving the public rows without it:", err);
      try {
        return await offlineCollection(userId, db);
      } catch (inner) {
        console.error("Public collection walk failed, retrying on the next request:", inner);
        return { sets: [], failed: true };
      }
    }
    console.error("Public collection walk failed, retrying on the next request:", err);
    return { sets: [], failed: true };
  }
});

/**
 * The readings, cached across requests under a tag that names their owner.
 *
 * In this file rather than in a value-history.ts of its own, and that is the
 * eslint cache leash rather than a judgement about where it belongs: two files
 * may import unstable_cache so the move to `use cache` stays a two-file change,
 * and everything else asks one of them for the data. This is one of the two, and
 * "what has this person's collection been worth" is the same kind of question as
 * the two above it — one with a whose in it.
 *
 * An hour, matching the collection's own TTL, and nothing invalidates it — see
 * valueHistoryTag in ./value-snapshot for why that is deliberate and what it
 * costs. `db` is closed over rather than built here for the reason on
 * cachedRows() above.
 */
const cachedSnapshots = (userId: string, db: SupabaseClient | null) =>
  unstable_cache(() => listSnapshots(userId, db), ["value-snapshots", userId], {
    revalidate: 3600,
    tags: [valueHistoryTag(userId)],
  })();

/**
 * What one person's collection has been worth, oldest reading first.
 *
 * ── What this replaced ─────────────────────────────────────────────────────
 *
 * A committed JSON file. app/components/CollectionValueCard.tsx imported
 * lib/core/collection-value.generated.json directly, and /api/v1/value-history
 * returned it to any authenticated caller. It was generated by
 * scripts/snapshot-collection-value.mjs for one account, so every account on the
 * deployment read that account's series: a new signup with three cards saw its
 * own "Collection value €12" tile with "Up €24,253 since December 2024, across
 * 1,524 cards" drawn directly underneath. Wrong for the reader, and a disclosure
 * of the seed owner's holdings to everyone else — the same failure the module
 * comment at the top of this file describes, arriving by a different route.
 *
 * That design was reasonable while there was one collection and no accounts: it
 * is a series nobody publishes, so it has to be recorded rather than fetched,
 * and a file in the repo is the cheapest place to put three points. What changed
 * is not the sourcing but that "the collection" stopped being one thing. The
 * recording still happens out of band; it just lands in a table with a user_id
 * on it now.
 *
 * `token` is resolved here, before the cache is entered, for the reason on
 * getCollection()'s own comment. It matters more here: value_snapshots_own has
 * no public branch to fall back on, so a client that names nobody gets nothing.
 *
 * `failed` rides beside the readings, exactly as it does on Collection above,
 * and this comment used to argue the opposite: that a chart draws nothing
 * either way, so an outage need not be told apart from an account that has
 * never been snapshotted. That is true of the pixels and false of the
 * sentence. A collector with six hundred readings, during a minute when the
 * store is unreachable, was handed `200 {"snapshots": []}` — the payload both
 * clients use to draw the brand-new-account empty state. "You have no value
 * history" is a claim about their collection, and the store had not said it.
 *
 * So the three states are the three the collection path already tells apart:
 * read it and it is empty, read it and it is not, could not read it. The
 * store's own `!db` (this deployment has no database at all, which is how CI
 * builds with no secrets) stays an ordinary empty, the same as listRows.
 *
 * Not directly tested: unstable_cache throws `incrementalCache missing` outside
 * a Next request, which is why collection.test.ts mocks at the module seam. The
 * coverage that matters is on listValueSnapshots below it and the route above.
 */
export type ValueHistory = { snapshots: ValueSnapshot[]; failed: boolean };

export const getValueHistory = cache(
  async (userId: string, token?: string): Promise<ValueHistory> => {
    try {
      const db = token ? userClient(token) : await serverClient();
      return { snapshots: await cachedSnapshots(userId, db), failed: false };
    } catch (err) {
      console.error("Value history unavailable, retrying on the next render:", err);
      return { snapshots: [], failed: true };
    }
  },
);

/**
 * Every reading for the cards this person holds, over the last few months.
 *
 * Cached the way everything else here is, under a tag of its own: the price
 * history changes when the cron runs, not when somebody edits a card, so it has
 * no business being dropped by cardsTag().
 *
 * ── The tag is declared and nothing drops it ───────────────────────────────
 *
 * This comment used to say the cron revalidates the tag after it writes, so a
 * fresh week's prices reach the dashboard immediately. It does not. Grep
 * revalidateTag across src: the calls are cardsTag() and valueHistoryTag().
 * Never this one.
 *
 * So the one-hour TTL is the whole mechanism, and a fresh reading can be up to
 * an hour late on the dashboard. That may well be fine — it is a nightly series,
 * and the sibling tag in value-snapshot.ts made the same trade deliberately for
 * years. What was not fine was a comment promising the opposite, which is how
 * you debug a staleness that the code never claimed to prevent.
 *
 * If it should be immediate, the fix is one line in api/v1/cron/snapshot/route.ts
 * beside the valueHistoryTag call that is already there.
 *
 * The window is ninety days rather than everything. Movers is a question about
 * recent movement, the table will only grow, and reading two years of readings
 * to compare the first with the last would get slower every week for an answer
 * that does not change.
 */
export const cardPricesTag = (userId: string) => `card-prices:${userId}`;

const WINDOW_DAYS = 90;
/** A `since` before any reading: one card's own line is everything it has, back to the backfill. */
export const ALL_READINGS = "2000-01-01";

/** The asked ids as one short key: order does not matter, the set does. */
const idsKey = (tcgIds: string[]) =>
  createHash("sha1")
    .update([...tcgIds].sort().join("\n"))
    .digest("hex");

/**
 * The readings and whether they could be read at all.
 *
 * Same shape and same reason as ValueHistory above. `/v1/cards/{tcgId}/prices`
 * documents an empty list as the honest answer for a card whose history has
 * not started yet, which it is — and which made a store outage answer the
 * identical payload. One of those two states is a fact about the card and the
 * other is a fact about this minute, and a client cannot tell them apart from
 * `{"points": []}`.
 */
export type CardPriceHistory = { points: CardPricePoint[]; failed: boolean };

export const getCardPrices = cache(
  async (
    userId: string,
    tcgIds: string[],
    token?: string,
    /** The earliest date wanted, yyyy-mm-dd; the ninety-day window when left out. */
    from?: string,
  ): Promise<CardPriceHistory> => {
    if (!tcgIds.length) return { points: [], failed: false };
    try {
      const db = token ? userClient(token) : await serverClient();
      // No database at all is not an outage: it is a deployment without one,
      // and listRows answers it the same way.
      if (!db) return { points: [], failed: false };
      // Computed here rather than inside the cache callback: unstable_cache
      // keys on the arguments, and a date built inside would be a new key
      // every day *and* a stale window on a hit. Outside, it is part of the
      // key, so the window moves with the day and the cache follows it.
      const since =
        from ?? new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
      const points = await unstable_cache(
        () => listCardPrices(db, tcgIds, since),
        // v3: the ids are part of the key. They were not, so the first asker's
        // list (a folder's, or one card's) was the answer for every later ask
        // under the same person and day: a card's own line came back as nine
        // thousand points of the whole collection.
        ["card-prices", "v3", userId, since, idsKey(tcgIds)],
        { revalidate: 3600, tags: [cardPricesTag(userId)] },
      )();
      return { points, failed: false };
    } catch (err) {
      console.error("Card price history unavailable, retrying on the next render:", err);
      return { points: [], failed: true };
    }
  },
);

/**
 * Whose collection /user/<name> shows, or null where nobody's is.
 *
 * The whole profile rather than just the id, because the page needs both halves
 * of it: the id to fetch the cards, and the name to say whose they are. That
 * name used to come from an env var (OWNER_NAME), which is how every account's
 * public page ended up titled after the deployment's owner. publicProfile()
 * already selects all three columns, so carrying the name out of here costs
 * nothing and removes the reason to look it up anywhere else.
 *
 * cache()d for the same reason getCards() above is: generateMetadata and the
 * page body are two calls in one render asking the identical question, and the
 * route is force-dynamic so nothing else would collapse them.
 */
export const ownerOf = cache(async (username: string): Promise<PublicProfile | null> =>
  publicProfile(username),
);
