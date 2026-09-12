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
import { priceFromMarket, priceFromUsd } from "../price-basis.mjs";
import { fetchUsdToEur } from "../catalogue/rates";
import { elapsed, logTiming, timed, timedCache } from "../timing";
import {
  pricesFor,
  usdFirstEdOf,
  usdFor,
  usdOf,
  usdPrintingsOf,
  type CardPrices,
  type UsdPair,
} from "../catalogue/tcgdex-client";
import { TCGCSV_CATEGORY, groupPrintings } from "../catalogue/tcgcsv";
import TCGPLAYER_IDS from "../tcgplayer-ids.generated.json";
import TCGPLAYER_IDS_JA from "../tcgplayer-ids.ja.generated.json";
import TCGPLAYER_GROUPS from "../tcgplayer-groups.generated.json";
import type { BrowseLanguage } from "../catalogue/tcgdex-browse";
import { cardsTag, foldersTag, type CollectionRow } from "./collection-row";
import { valueHistoryTag, type ValueSnapshot } from "./value-snapshot";
import { cardsVersion, listRows, listSnapshots, publicProfile } from "../../storage/collection";
import {
  getFolder,
  listCardPrices,
  listFolders,
  listPublicFolders,
  rememberScans,
  type Folder,
} from "../../storage/postgres";
import { rememberedScans } from "./remembered-scans";
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
 * TCGplayer's prices for these cards, from their tcgcsv groups: the browse surfaces' price.
 *
 * For a set page, a search and the catalogue's card list, where the cards are the catalogue's
 * rather than the viewer's. A card's product comes from the shelf's id map and its group from
 * tcgplayer-groups.generated.json; each group is one cached request a day, and every card of it is
 * read out of that one answer, so a set page of 250 cards is a handful of cache reads. It read
 * Cardmarket's guide until 2026-09-12, and a set page then showed one market while the collection
 * showed another.
 *
 * English and Japanese only: TCGplayer sells no Korean or Chinese cards, and those pages carry no
 * price rather than another market's. A card with no product, or a group that does not answer,
 * is left out; the caller draws a blank line.
 */
export const tcgplayerPricesFor = async (
  ids: string[],
  /** Which catalogue the ids are from. A Japanese set page prices from the Japanese shelf. */
  language: BrowseLanguage | null = null,
): Promise<Map<string, CardPrices>> => {
  const out = new Map<string, CardPrices>();
  if (!ids.length || (language && language !== "ja")) return out;
  const rate = await usdToEurForRequest();
  if (rate == null) return out;
  const category = language === "ja" ? TCGCSV_CATEGORY.ja : TCGCSV_CATEGORY.en;
  const groupsOf =
    (TCGPLAYER_GROUPS as Record<string, Record<string, number>>)[String(category)] ?? {};
  const productOf = (id: string): number | null => {
    if (language === "ja") return (TCGPLAYER_IDS_JA as Record<string, number | null>)[id] ?? null;
    return TCGCSV_LINKS[id]?.productId ?? null;
  };
  const wanted = new Map<number, { id: string; productId: number }[]>();
  for (const id of ids) {
    const productId = productOf(id);
    const groupId = productId == null ? undefined : groupsOf[String(productId)];
    if (productId == null || groupId == null) continue;
    wanted.set(groupId, [...(wanted.get(groupId) ?? []), { id, productId }]);
  }
  await mapLimit([...wanted.keys()], 6, async (groupId) => {
    let printings: Awaited<ReturnType<typeof cachedGroupPrintings>>;
    try {
      printings = await cachedGroupPrintings(groupId, category);
    } catch (err) {
      console.error(`tcgcsv group ${groupId} unavailable, its cards unpriced on this page:`, err);
      return;
    }
    for (const { id, productId } of wanted.get(groupId) ?? []) {
      const tp = printings[String(productId)];
      const usd = tp ? usdOf(tp) : null;
      const price = usd ? priceFromUsd(usd, rate) : null;
      if (price) out.set(id, { price, holo: null });
    }
  });
  return out;
};

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
      // v11: 169 more English cards linked by how TCGplayer spells them (Prism Star, LV.X, Basic
      // Energy, energy letters) and by name where the number is written another way.
      //
      // v10: WotC Promo 1 Pikachu relinked from its unpriced misprint to "Pikachu (1)".
      //
      // v9: 60 more cards linked (Deck Exclusives, Alternate Art Promos, Nidoran F and M). The links
      // are read at request time, but a v8 entry holds these cards unpriced for its day.
      //
      // v8: Base Set's Shadowless and stamped runs priced from TCGplayer's Shadowless group.
      //
      // v7: 968 promo and subset cards priced from tcgcsv, where TCGdex relays no TCGplayer
      // figure (tcgplayer-links.mjs). A v6 entry holds them unpriced for a day after the deploy.
      //
      // v6: every price is TCGplayer's or none, the Near Mint band is gone, and an unclassified
      // copy no longer reads a reverse's figure (2026-09-12). An entry written under v5 holds
      // the blend of both markets, and would stand for a day after the deploy.
      //
      // v5: a card's facts carry the printings and which market answered for a copy, and the
      // 52 Mega cards linked in #350 have a product to be priced from for the first time.
      ["collection-facts", "v11", userId, bundleSignature(groups, usdToEur)],
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
      // v22: 52 Mega cards linked for the first time; an entry made while they had no product
      // holds no price for them, so it has to go rather than expire.
      //
      // v21: 236 cards relinked, the unlimited half of a set that was reading its own holo.
      //
      // v20: the two dear halves of v19 pointed into a Japanese expansion and are now on the
      // XY Black Star Promos products they belong to.
      //
      // v19: four XY promo links swapped, the same way as v17 and v18. The signature above
      // hashes which cards a set holds, never what they are worth, so a relink is invisible
      // to it: the key is the only thing that reprices a card today rather than tomorrow.
      // collection-facts holds the bundle of these and is keyed on the same signature, so it
      // moves to v2 with this.
      //
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
      // v22: the facts carry TCGplayer's printings, which a v21 entry does not, and an entry
      // made while the Mega cards had no Cardmarket product holds no price for them (#350).
      ["set-facts", "v22", setName, factsSignature(identities)],
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
      // v3: the answer carries every printing TCGplayer prices now, and a v2 entry holds the two
      // runs alone. The Data Cache outlives a deploy, so a stale entry would leave every copy on
      // the old first-printing-wins figure until its day was up.
      ["tcgdex-usd", "v3", setName, createHash("sha1").update(ids.join("\u0001")).digest("hex")],
      { revalidate: DAY, tags: ["catalogue"] },
    )(),
  );

/**
 * The cards tcgplayer-links.mjs linked to a tcgcsv group because TCGdex relays no TCGplayer
 * figure for them: the Galarian Gallery, the Trainer Galleries, the Shiny Vaults, the Black Star
 * promo lines. 968 cards on 2026-09-12, 209 of them held by the owner.
 */
const TCGCSV_LINKS = TCGPLAYER_IDS as Record<
  string,
  | {
      productId: number;
      groupId?: number;
      /** The card's Shadowless run, in TCGplayer's group for it: Base Set only. */
      shadowless?: { productId: number; groupId: number };
    }
  | null
  | undefined
>;

/** One tcgcsv group's printings, a day at a time. A plain object: a Map comes back from the Data Cache as `{}`. */
const cachedGroupPrintings = (groupId: number, category: number = TCGCSV_CATEGORY.en) =>
  timedCache(`cache tcgcsv group ${category}/${groupId}`, (ran) =>
    unstable_cache(
      async () => {
        ran();
        return Object.fromEntries(await groupPrintings(groupId, category));
      },
      // v2: keyed by the shelf too, now that the Japanese one is read the same way.
      ["tcgcsv-group", "v2", String(category), String(groupId)],
      { revalidate: DAY, tags: ["catalogue"] },
    )(),
  );

/** Exported for its test rather than for any caller: the rule is about money. */
export const usdForSet = async (
  setName: string,
  ids: string[],
): Promise<Record<string, UsdPair>> => {
  if (!ids.length) return {};
  let answer: Record<string, UsdPair> = {};
  try {
    answer = await cachedTcgdexUsd(setName, ids);
  } catch (err) {
    console.error(`TCGplayer prices unavailable for ${setName} from TCGdex:`, err);
  }
  /*
   * Then tcgcsv, for the linked cards TCGdex said nothing about. Read through the same pickers as
   * TCGdex's figures (usdOf, usdFirstEdOf, usdPrintingsOf), because groupPrintings() hands back
   * the same shape: a promo is priced by exactly the rules a set card is. A group that does not
   * answer costs its cards their price for this request, not TCGdex's answer for the others.
   */
  const linked = ids.filter((id) => !answer[id]?.usd && TCGCSV_LINKS[id]?.groupId != null);
  if (!linked.length) return answer;
  const out = { ...answer };
  const groups = [...new Set(linked.map((id) => TCGCSV_LINKS[id]!.groupId!))];
  await mapLimit(groups, 4, async (groupId) => {
    let printings: Awaited<ReturnType<typeof cachedGroupPrintings>>;
    try {
      printings = await cachedGroupPrintings(groupId);
    } catch (err) {
      console.error(`tcgcsv group ${groupId} unavailable, its linked cards unpriced for now:`, err);
      return;
    }
    for (const id of linked) {
      const link = TCGCSV_LINKS[id]!;
      if (link.groupId !== groupId) continue;
      const tp = printings[String(link.productId)];
      const usd = tp ? usdOf(tp) : null;
      if (!tp || !usd) continue;
      out[id] = { usd, firstEd: usdFirstEdOf(tp), printings: usdPrintingsOf(tp) };
    }
  });
  return out;
};

/**
 * The Shadowless run's printings, and the stamped run's where it is filed there too, for the cards
 * tcgplayer-links.mjs linked to TCGplayer's Shadowless group.
 *
 * TCGplayer files the Shadowless Base Set as a group of its own, whose "Unlimited" is the
 * Shadowless run and "1st Edition" the stamped one; TCGdex relays neither. They are renamed to the
 * runs copyPriceOf() asks for ("shadowless-holofoil", "1st-edition-holofoil"), so a Shadowless
 * copy reads its own figure and a 1st Edition Base Set copy reads the stamped run's, instead of
 * both reading the ordinary card (Charizard: $869.02 ordinary, $2,257.87 Shadowless, $10,000
 * stamped, 2026-09-12). Exported for its test.
 */
export const runPrintingsForSet = async (
  ids: string[],
): Promise<
  Record<string, Pick<UsdPair, "firstEd"> & { printings: NonNullable<UsdPair["printings"]> }>
> => {
  const linked = ids.filter((id) => TCGCSV_LINKS[id]?.shadowless);
  if (!linked.length) return {};
  const out: Awaited<ReturnType<typeof runPrintingsForSet>> = {};
  const groups = [...new Set(linked.map((id) => TCGCSV_LINKS[id]!.shadowless!.groupId))];
  await mapLimit(groups, 2, async (groupId) => {
    let printings: Awaited<ReturnType<typeof cachedGroupPrintings>>;
    try {
      printings = await cachedGroupPrintings(groupId);
    } catch (err) {
      console.error(`tcgcsv group ${groupId} unavailable, Shadowless runs unpriced for now:`, err);
      return;
    }
    for (const id of linked) {
      const run = TCGCSV_LINKS[id]!.shadowless!;
      if (run.groupId !== groupId) continue;
      const tp = printings[String(run.productId)];
      if (!tp) continue;
      // "unlimited" in the Shadowless group is the Shadowless run; "1st-edition" keeps its name.
      const renamed = Object.fromEntries(
        Object.entries(tp).map(([name, v]) => [
          name.replace(/^unlimited|^normal$/, "shadowless"),
          v,
        ]),
      );
      out[id] = { printings: usdPrintingsOf(renamed), firstEd: usdFirstEdOf(renamed) };
    }
  });
  return out;
};

/**
 * Every card in a set's facts with no price on it at all.
 *
 * Not a price of zero and not the guide's euros: nothing. Used where the day's dollar rate
 * could not be read, which is the one case where TCGplayer's figure exists and cannot be
 * stated in this collection's currency.
 */
const unpriced = <T extends { price?: unknown; priceHolo?: unknown; priceShadowless?: unknown }>(
  cards: Record<string, T>,
): Record<string, T> =>
  Object.fromEntries(
    Object.entries(cards).map(([key, f]) => [
      key,
      { ...f, price: null, priceHolo: null, priceShadowless: null },
    ]),
  );

/** The set's facts with TCGplayer's figure as every price, where the rate allows. */
async function factsWithUsd(
  setName: string,
  identities: CardIdentity[],
  priceSource: (ids: string[]) => Promise<Map<string, CardPrices>>,
  usdToEur: number | null,
) {
  const facts = await cachedSetFacts(setName, identities, priceSource);
  /* No rate, no price. The figures underneath are the guide's euros, and handing those back
     would quietly put a card on the European market's number without saying so, which is the
     confusion this whole change exists to end. The rate is cached for a day, so this bites
     only on a cold cache during a frankfurter outage, and then every card reads "no price"
     rather than the wrong one. */
  if (usdToEur == null) return { ...facts, cards: unpriced(facts.cards) };
  /* Only the English cards, by their TCGdex id: a card from its own catalogue is not on
     TCGplayer's English shelf, so nothing here can price it. A card whose facts already carry
     the dollar figure, priced by TCGdex because the guide had nothing, is not asked twice. */
  const wanted = Object.values(facts.cards).flatMap((f) =>
    !f.catalogue && f.tcgId && !f.usd ? [f.tcgId] : [],
  );
  const [usd, runs] = await Promise.all([
    usdForSet(setName, [...new Set(wanted)]),
    runPrintingsForSet(
      Object.values(facts.cards).flatMap((f) => (!f.catalogue && f.tcgId ? [f.tcgId] : [])),
    ),
  ]);
  const cards = Object.fromEntries(
    Object.entries(facts.cards).map(([key, f]) => {
      // A Japanese, Korean or Chinese printing: TCGplayer's English shelf does not carry it,
      // so it has no price here. Its own catalogue's figure is Cardmarket's and no longer
      // shown. tcgcsv carries TCGplayer's Japanese shelf and is where this comes back from.
      if (f.catalogue) return [key, { ...f, price: null }];
      const fetched = f.tcgId ? usd[f.tcgId] : null;
      const p = f.usd ?? fetched?.usd ?? null;
      /* The stamped run's own dollars, converted. Nothing to reconcile any more: every price
         on this card is TCGplayer's now, this one included. */
      const run = f.tcgId ? runs[f.tcgId] : undefined;
      const first = f.usdFirstEd ?? fetched?.firstEd ?? run?.firstEd ?? null;
      /*
       * Every printing TCGplayer prices, in euros, and the product id beside it.
       *
       * This is the market that tells a holo from the plain card and a stamped run from an
       * unlimited one; Cardmarket files those together often enough to be wrong by multiples
       * (a Jungle Scyther is one product there and two printings here). copyPriceOf() reads
       * these first, and a card TCGplayer does not price has no price at all. The ids travel
       * so a person can open the page the figure came from and check it.
       */
      // The Shadowless group's runs beside them, where the card has one; TCGdex's names win a clash.
      const own = f.usdPrintings ?? fetched?.printings ?? null;
      const printings = run ? { ...run.printings, ...own } : own;
      const pricePrintings = printings
        ? Object.fromEntries(
            Object.entries(printings).map(([name, v]) => [name, priceFromUsd(v, usdToEur)]),
          )
        : null;
      const printingIds = printings
        ? Object.fromEntries(
            Object.entries(printings).flatMap(([name, v]) =>
              v.productId == null ? [] : [[name, v.productId]],
            ),
          )
        : null;
      return [
        key,
        {
          ...f,
          price: priceFromMarket(f.price, p ? priceFromUsd(p, usdToEur) : null),
          priceFirstEd: first ? priceFromUsd(first, usdToEur) : null,
          pricePrintings,
          printingIds,
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

export const usdToEurForRequest = cache(async (): Promise<number | null> => {
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
  const usdToEur = await usdToEurForRequest();
  // The same rows and rate on the same instance within minutes: the same sets. A write changes
  // the rows (their cache is dropped by tag), so the key changes and the join runs again;
  // /folders, /stats and /cards on one screen, or the Pokédex's read after the count's, do not
  // each pay the ~100 cache reads and the join over two thousand rows.
  const key = `${userId}:${rowsVersion(rows)}:${usdToEur ?? "-"}`;
  const kept = assembled.get(key);
  if (kept && kept.until > Date.now()) {
    logTiming("cache assemble hit", 0, `${rows.length} rows`);
    return kept.sets;
  }
  // TCGdex's record per card, which carries TCGplayer's printings; the Cardmarket guide that used
  // to answer first is gone (2026-09-12), and TCGdex was already asked for every card after #354.
  const priceSource = (ids: string[]) =>
    timed("tcgdex pricesFor", () => pricesFor(ids), `${ids.length} cards`);
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
 * TCGdex is down, not the store. Matched by name because the error has crossed
 * unstable_cache and mapLimit on its way here, and because a test that mocks
 * the catalogue module does not carry the class.
 *
 * Both names, because there are two and they mean the same thing to this
 * caller: `CatalogueUnavailable` is TCGdex asked and refusing
 * (catalogue.ts), `CatalogueDown` is TCGdex not asked at all because the
 * breaker is open (tcgdex-client.ts). Only the first was matched here, and on
 * the evening of 2026-09-12 TCGdex went down for half an hour: the first call
 * tripped the breaker and every call after it threw the *other* name, which
 * fell past this guard. The offline path was right there and unreachable, so
 * `GET /v1/cards` answered 503 and the Collection page read "This page
 * couldn't load" while every row sat in the store, cached and ready.
 */
const isCatalogueOutage = (err: unknown): boolean =>
  err instanceof Error && (err.name === "CatalogueUnavailable" || err.name === "CatalogueDown");

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
 * Write the pictures of this collection down on its rows.
 *
 * The read has just worked every one of them out against the catalogue; this is what keeps that
 * answer when the catalogue next goes quiet. See remembered-scans.ts for why a row is allowed
 * to hold a catalogue fact at all, and buildCollection() for the side it is read on.
 *
 * Called by the warm cron rather than by a read: a GET does not write, and the warm run has the
 * whole collection in hand every ten minutes anyway, so a card added at noon is remembered
 * within ten minutes of being added. A write moves `cards_version` and so costs the rows cache,
 * which is why this is careful to write only what actually changed: after the first pass that
 * is nothing at all, on almost every run.
 */
export async function rememberCollectionScans(
  userId: string,
  sets: CardSet[],
  db: SupabaseClient | null,
): Promise<number> {
  if (!db) return 0;
  const memories = rememberedScans(await cachedRows(userId, db), sets);
  return memories.length ? rememberScans(db, userId, memories) : 0;
}

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
