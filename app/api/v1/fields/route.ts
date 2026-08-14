import { NextResponse } from "next/server";
import { optionsFor } from "../../../../lib/storage/collection";
import { authorise, readHeaders, refused, storeErrorResponse } from "../../../../lib/api/guard";

/**
 * What the collection's select columns currently offer, so a form is built from
 * the collection rather than from a list written down beside it. A set added
 * this morning is offered this afternoon, and a renamed rarity does not leave a
 * client offering the old name.
 *
 * Behind the key, unlike the other two reads, and not because the answer is
 * secret: it is the cheapest thing a client can call to find out whether the
 * key it holds still works. Every client signs in by asking for this, so a
 * wrong key fails on one request before a card has been typed out. That job
 * gets more important, not less, once the key is a token that expires.
 *
 * Uncached. The one moment its answer matters most is the moment after a set
 * has been created that did not exist before, and a cached list would then be
 * offering yesterday's sets to the person who just made today's.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const who = await authorise(req);
  if (refused(who))
    return NextResponse.json({ error: who.error }, { status: who.status, headers: readHeaders(req) });

  try {
    return NextResponse.json(await optionsFor(), { headers: readHeaders(req) });
  } catch (err) {
    return storeErrorResponse(err, req, "Card fields failed");
  }
}
