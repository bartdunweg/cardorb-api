import { NextResponse } from "next/server";
import { getCards } from "../../../../lib/core/cards";
import { readHeaders } from "../../../../lib/api/guard";

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
 */
export const revalidate = 3600;

export async function GET() {
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

  return NextResponse.json(
    { sets },
    {
      headers: {
        ...readHeaders,
        // Stale-while-revalidate rather than a hard hour: a client that asks
        // one second after the window closes should get last hour's answer
        // immediately and the fresh one next time, not wait on a Notion walk.
        "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
