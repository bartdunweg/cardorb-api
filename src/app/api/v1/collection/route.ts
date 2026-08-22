import { NextResponse } from "next/server";
import { getCards } from "@/lib/core/collection/collection";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";

/**
 * The whole collection, grouped by set. This is the endpoint every client
 * actually lives on: the web tool renders it, the iOS app caches it, and both
 * get exactly what the walk produced rather than a shape invented for one of
 * them.
 *
 * It is big, around a megabyte of JSON for 1,600 cards, and that is the right
 * trade against the alternative of a client asking for a set at a time and
 * paying fifty round trips to draw one screen. Gzip takes most of it and the
 * hour of caching below takes the rest.
 *
 * An ETag comes when the iOS app is built and can send an If-None-Match. Adding
 * one now would be guessing at what it wants to compare.
 *
 * Behind the key since /user/<name> exists. That page shows the collection with
 * every price removed, and it is only worth removing them if they cannot be
 * asked for directly: an open endpoint here would hand back the same cards with
 * the numbers still on them, which makes the public page a curtain rather than
 * a wall. Nothing was lost by closing it — the page renders from getCards()
 * rather than from this route, and the iOS app was always going to send a key.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const who = await authorise(req);
  if (refused(who)) {
    return NextResponse.json({ error: who.error }, { status: who.status });
  }

  // Whose collection, which is the whole of what changed here. It used to be
  // the collection, singular, and the endpoint could not have said whose if it
  // had been asked. The token, not just the id: getCards() needs the caller's
  // own connection to satisfy row level security, see its own comment.
  const sets = await getCards(who.userId, bearer(req) ?? undefined);

  // "An empty collection is never true" used to live here, and it threw. It was
  // right: there was one collection, it had sixteen hundred cards in it, and an
  // empty answer could only mean the store was unreachable — which a client
  // would cache as "every card is gone" and an app would wipe its own cache
  // over.
  //
  // It stopped being right on the day somebody could make an account. A new
  // account owns nothing, and that is the honest answer to give them rather
  // than a 500 on their first sign-in. What made the old rule safe to retire is
  // that the thing it guarded against moved: getCards() no longer caches a
  // failure, so an outage is an empty answer for one request rather than for an
  // hour, and the next one tries again.

  // The stale-while-revalidate hour that used to be here has gone with the
  // lock: `public` on a shared cache means the CDN may hand this to the next
  // person who asks, key or no key, which would quietly undo the check above.
  // readHeaders now says `private, no-store`. The walk itself is still
  // memoised inside getCards(), so this costs a round trip and not a rebuild.
  return NextResponse.json({ sets }, { headers: readHeaders(req) });
}
