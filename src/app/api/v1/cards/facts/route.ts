import { NextResponse } from "next/server";
import { apiError, unavailable } from "@/lib/api/respond";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { BODY_LIMIT, readJsonBody } from "@/lib/api/body";
import { cardFactsOf, validateFactsIds } from "@/lib/core/catalogue/card-facts";
import { isBrowseLanguage } from "@/lib/core/catalogue/tcgdex-browse";

/**
 * The facts of many cards in one request, for a page of tiles (card-facts.ts).
 *
 * A POST because the ids are a body: 250 of them do not belong in a request line. It reads and
 * changes nothing, so it takes authorise() as GET /v1/cards/{tcgId} does, and answers the same
 * private, uncached headers: the facts are the same for everyone, the door is not.
 *
 * Every id asked is a key of `cards`. Null is "ask GET /v1/cards/{tcgId}", not "no such card":
 * this reads the copy and nothing else, so a card the copy lacks costs no TCGdex call per id here.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const who = await authorise(req);
  if (refused(who))
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });

  const read = await readJsonBody<Record<string, unknown>>(req, BODY_LIMIT.cardIds);
  if (read.kind === "too-large")
    return apiError(413, "Payload too large", undefined, { headers: readHeaders(req) });
  if (read.kind === "invalid")
    return apiError(400, "Invalid request", undefined, { headers: readHeaders(req) });

  const named = validateFactsIds(read.body?.ids);
  if (named.kind === "invalid")
    return apiError(400, named.error, undefined, { headers: readHeaders(req) });
  const language = read.body?.language ?? "en";
  if (language !== "en" && !isBrowseLanguage(language))
    return apiError(400, "language must be en or ja.", undefined, { headers: readHeaders(req) });

  let cards;
  try {
    cards = await cardFactsOf(named.ids, language);
  } catch (err) {
    console.error(`The facts of ${named.ids.length} cards could not be read:`, err);
    return unavailable("Those cards could not be read. Try again in a moment.", readHeaders(req));
  }
  return NextResponse.json({ cards }, { headers: readHeaders(req) });
}
