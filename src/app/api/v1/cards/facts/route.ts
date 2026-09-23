import { NextResponse } from "next/server";
import { apiError, unavailable } from "@/lib/api/respond";
import { authoriseOpen, readHeaders, refused } from "@/lib/api/guard";
import { BODY_LIMIT, readJsonBody } from "@/lib/api/body";
import { cardFactsOf, validateFactsIds } from "@/lib/core/catalogue/card-facts";
import { isBrowseLanguage } from "@/lib/core/catalogue/tcgdex-browse";

/**
 * The facts of many cards in one request, for a page of tiles (card-facts.ts).
 *
 * A POST because the ids are a body: 250 of them do not belong in a request line. It reads and
 * changes nothing, and since 2026-09-23 it answers a caller who offered no credential, as its
 * single-card twin GET /v1/cards/{tcgId} does since #586: a visitor on Browse asks it for a whole
 * set's facts at once, and the facts are the same for everyone. It reads the copy through the
 * service role (card-facts.ts), so a visitor needs no grant of their own.
 *
 * Every answer stays private and uncached, the open one too. Not for secrecy: a POST is never a
 * shared cache's to hold, so the open window would promise a caching that does not happen.
 *
 * Every id asked is a key of `cards`. Null is "ask GET /v1/cards/{tcgId}", not "no such card":
 * this reads the copy and nothing else, so a card the copy lacks costs no TCGdex call per id here.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Nobody asking is allowed. An offered credential that does not verify is still refused.
  const who = await authoriseOpen(req);
  if (who && refused(who))
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
