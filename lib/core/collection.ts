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
 * The expensive half went somewhere else entirely: see lib/core/catalogue.ts,
 * where the facts about cards — the same for everybody — are cached once and
 * shared. What is left here is a database read and an in-memory join.
 */

import { cache } from "react";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCollection, type CardSet } from "./cards";
import { cardsTag } from "./collection-row";
import { listRows, publicProfile } from "../storage/collection";
import type { PublicProfile } from "../storage/postgres";
import { serverClient, userClient } from "../storage/supabase";

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
  unstable_cache(() => listRows(userId, db), ["collection-rows", userId], {
    revalidate: 3600,
    tags: [cardsTag(userId)],
  })();

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
const cachedCollection = (userId: string, db: SupabaseClient | null) =>
  unstable_cache(
    async () => buildCollection(await cachedRows(userId, db)),
    ["collection", userId],
    { revalidate: 3600, tags: [cardsTag(userId)] },
  )();

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
 */
export const getCards = cache(async (userId: string, token?: string): Promise<CardSet[]> => {
  try {
    const db = token ? userClient(token) : await serverClient();
    return await cachedCollection(userId, db);
  } catch (err) {
    console.error("Card collection walk failed, retrying on the next render:", err);
    return [];
  }
});

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
