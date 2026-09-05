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
  identityKey,
  resolveSetFacts,
} from "./cards";
import { DAY } from "../util";
import { elapsed, logTiming, timed, timedCache } from "../timing";
import { fetchPriceGuide, guidePrices } from "../catalogue/price-guide";
import { pricesFor, type CardPrices } from "../catalogue/tcgdex-client";
import type { ProductIds } from "./snapshot";
import IDS from "../cardmarket-ids.generated.json";
import { cardsTag, foldersTag, type CollectionRow } from "./collection-row";
import { valueHistoryTag, type ValueSnapshot } from "./value-snapshot";
import { listRows, listSnapshots, publicProfile } from "../../storage/collection";
import { getFolder, listCardPrices, listFolders, type Folder } from "../../storage/postgres";
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
const cachedRows = (userId: string, db: SupabaseClient | null) =>
  timedCache("cache rows", (ran) =>
    unstable_cache(
      () => {
        ran();
        return timed("store listRows", () => listRows(userId, db));
      },
      ["collection-rows", userId],
      { revalidate: 3600, tags: [cardsTag(userId)] },
    )(),
  );

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
 * data cache; what it says about the sixteen hundred cards this deployment
 * knows a product id for is a couple of hundred kilobytes and can.
 */
export const PRICE_GUIDE_TAG = "price-guide";

const cachedGuidePrices = () =>
  timedCache("cache guide-prices", (ran) =>
    unstable_cache(
      async (): Promise<Record<string, CardPrices>> => {
        ran();
        const ids = Object.keys(IDS as ProductIds);
        return Object.fromEntries(guidePrices(ids, await fetchPriceGuide(), IDS as ProductIds));
      },
      ["guide-prices"],
      { revalidate: 86_400, tags: [PRICE_GUIDE_TAG] },
    )(),
  );

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
const guideForRequest = cache(async (): Promise<Record<string, CardPrices>> => {
  try {
    return await cachedGuidePrices();
  } catch (err) {
    console.error("Price guide unavailable, pricing card by card:", err);
    return {};
  }
});

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
      ["set-facts", "v2", setName, factsSignature(identities)],
      { revalidate: DAY, tags: ["catalogue"] },
    )(),
  );

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
  const known = await guideForRequest();
  const priceSource = (ids: string[]) => guideThenTcgdex(ids, known);
  const start = performance.now();
  const sets = await buildCollection(rows, {
    factsSource: (setName, identities) => cachedSetFacts(setName, identities, priceSource),
  });
  logTiming("buildCollection", elapsed(start), `${rows.length} rows ${sets.length} sets`);
  return sets;
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
 * Fails soft to an empty history. That is not ambiguous the way an empty
 * collection was — no `failed` flag beside it — because the card draws nothing
 * either way, and a chart is not something to write an error state for.
 *
 * Not directly tested: unstable_cache throws `incrementalCache missing` outside
 * a Next request, which is why collection.test.ts mocks at the module seam. The
 * coverage that matters is on listValueSnapshots below it and the route above.
 */
export const getValueHistory = cache(
  async (userId: string, token?: string): Promise<ValueSnapshot[]> => {
    try {
      const db = token ? userClient(token) : await serverClient();
      return await cachedSnapshots(userId, db);
    } catch (err) {
      console.error("Value history unavailable, retrying on the next render:", err);
      return [];
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

export const getCardPrices = cache(
  async (userId: string, tcgIds: string[], token?: string): Promise<CardPricePoint[]> => {
    if (!tcgIds.length) return [];
    try {
      const db = token ? userClient(token) : await serverClient();
      if (!db) return [];
      // Computed here rather than inside the cache callback: unstable_cache
      // keys on the arguments, and a date built inside would be a new key
      // every day *and* a stale window on a hit. Outside, it is part of the
      // key, so the window moves with the day and the cache follows it.
      const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
      return await unstable_cache(
        () => listCardPrices(db, tcgIds, since),
        ["card-prices", userId, since],
        { revalidate: 3600, tags: [cardPricesTag(userId)] },
      )();
    } catch (err) {
      console.error("Card price history unavailable, retrying on the next render:", err);
      return [];
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
