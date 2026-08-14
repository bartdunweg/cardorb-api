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
import { buildCollection, type CardSet } from "./cards";
import { cardsTag } from "./collection-row";
import { listRows, publicProfile } from "../storage/collection";
import { PUBLIC_USERNAME } from "./config";

/**
 * Whose collection, on the one store that cannot say.
 *
 * It was written as a stand-in for a user id, so that "every cache key, every
 * tag and every call site is already the shape it needs to be when accounts
 * land — the change then is what this resolves to, not where it is threaded".
 *
 * Half of that came true and the wrong half is worth keeping written down,
 * because it cost a real bug. A *default argument* is not a thread. It is a
 * place the argument can silently fail to arrive, and it did: two card pages
 * and the modal called getCards() with nothing, got "owner" where Postgres
 * wanted a uuid, and every one of them answered "no, you do not hold this
 * card" to the person holding 1,968 of them. The query failed, the fail-soft
 * catch turned it into an empty collection, and an empty collection is a
 * perfectly ordinary-looking answer.
 *
 * So the default is gone and this is now only what it always honestly was: the
 * name the Notion reader understands, on a deployment that has one collection
 * and no notion of whose. It dies with COLLECTION_SOURCE=notion.
 */
export const OWNER = "owner";

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
 */
const cachedRows = (userId: string) =>
  unstable_cache(() => listRows(userId), ["collection-rows", userId], {
    revalidate: 3600,
    tags: [cardsTag(userId)],
  })();

/**
 * The collection, built.
 *
 * Fails soft, like everything else that faces a page: a store outage or a
 * catalogue that refuses three times in a row renders an empty state and says
 * so, rather than taking the route down. The empty lasts one render — nothing
 * here remembers it — so the next request tries again and finds most of the
 * work already in a cache.
 */
export const getCards = cache(async (userId: string): Promise<CardSet[]> => {
  try {
    return await buildCollection(await cachedRows(userId));
  } catch (err) {
    console.error("Card collection walk failed, retrying on the next render:", err);
    return [];
  }
});

/**
 * Whose collection /user/<name> shows, or null where nobody's is.
 *
 * Two answers behind one question, because there are two stores. Postgres looks
 * the name up and refuses one that is not shared. Notion has one collection and
 * no idea whose, so it falls back to the environment variable that has stood in
 * for a profile table all along — and returns the placeholder user id, which is
 * the only one that store's reader understands.
 */
export async function ownerOf(username: string): Promise<string | null> {
  const profile = await publicProfile(username);
  if (profile) return profile.id;
  // The Notion path, where publicProfile() answers null by design.
  const { source } = await import("../storage/collection");
  if (source() === "notion" && username === PUBLIC_USERNAME) return OWNER;
  return null;
}
