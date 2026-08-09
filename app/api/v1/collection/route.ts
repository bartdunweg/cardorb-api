import { NextResponse } from "next/server";
import { getCards } from "../../../../lib/core/cards";
import { readHeaders, refuseUnauthorised } from "../../../../lib/api/guard";

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
  const refusal = refuseUnauthorised(req);
  if (refusal) {
    return NextResponse.json({ error: refusal.error }, { status: refusal.status });
  }

  const sets = await getCards();

  // An empty collection is never true. getCards() fails soft and returns []
  // when there is no token or Notion is unreachable, and 200 with an empty
  // array tells a client that every card is gone: an app that trusts it wipes
  // its cache, and the answer sits in front of the next reader for an hour.
  //
  // Thrown rather than returned as a 503, which is the rule this project
  // inherits: a failure that would otherwise be cached has to throw, so the
  // cache does not remember it. Found the honest way, by building this before
  // the token was in the environment and serving an empty binder for an hour.
  if (!sets.length) throw new Error("The collection came back empty; refusing to serve it.");

  // The stale-while-revalidate hour that used to be here has gone with the
  // lock: `public` on a shared cache means the CDN may hand this to the next
  // person who asks, key or no key, which would quietly undo the check above.
  // readHeaders now says `private, no-store`. The walk itself is still
  // memoised inside getCards(), so this costs a round trip and not a rebuild.
  return NextResponse.json({ sets }, { headers: readHeaders(req) });
}
