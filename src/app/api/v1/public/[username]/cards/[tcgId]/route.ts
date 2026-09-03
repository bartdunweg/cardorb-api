import { NextResponse } from "next/server";
import { apiError, unavailable } from "@/lib/api/respond";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { getCardDetail } from "@/lib/core/collection/cards";
import { ownerOf } from "@/lib/core/collection/collection";

/**
 * One card, for the public link, without a price on it.
 *
 * The keyed twin of this route (/v1/cards/[tcgId]) carries the price and the
 * raw Cardmarket figures, which is exactly what /user/<name> goes out of its
 * way not to show. This one exists because the public page still needs to open
 * a card: it used to link to /cards/<id>, and the proxy in front of /cards
 * turned a visitor's tap on a scan into the login screen.
 *
 * Addressed by username rather than left open at /v1/public/cards/<id>, so the
 * route says whose collection it is answering for. The check below is the
 * lookup this comment promised: it used to compare against a single username
 * from the environment, which 404'd every other account's cards long after
 * accounts existed, while both sibling routes here had already moved to
 * ownerOf(). The card itself is catalogue data and the same for everybody; the
 * name decides whether there is a public collection to open it from at all.
 *
 * Stripped here rather than in the client, for the same reason the page strips
 * before rendering: a number that is deleted after it arrives has still
 * arrived. `price` and `market` are the only two fields that carry money, and
 * both are nullable already, so everything downstream draws the card without
 * them without knowing anything changed.
 */
export const dynamic = "force-dynamic";

/**
 * Sixty a minute per address, the same as both sibling public routes.
 *
 * The CDN header below does not stand in for this, and this route is the worst
 * case of the three for exactly that reason: the cache key is the *path*, and
 * the path carries an arbitrary card id. Every distinct id is a cold miss
 * costing one Postgres round trip (`ownerOf`) plus one outbound TCGdex fetch,
 * so a loop over invented ids never touches the cache once. A security review rejected
 * "the CDN covers it" for the sibling collection route, where there is at least
 * one canonical URL per user; here there is not.
 */
const byAddress = createRateLimiter(60_000, 60);

const addressOf = (req: Request) =>
  req.headers.get("x-real-ip")?.trim() ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string; tcgId: string }> },
) {
  if (byAddress(addressOf(req))) {
    return apiError(429, "Too many requests");
  }

  const { username, tcgId } = await params;
  if (!(await ownerOf(username))) {
    return apiError(404, "No such collection.");
  }

  let card;
  try {
    card = await getCardDetail(tcgId);
  } catch (err) {
    // The catalogue did not answer. Not a 404: the CDN below would keep that
    // for an hour and the card would look gone for everyone.
    console.error(`Card ${tcgId} could not be read:`, err);
    return unavailable();
  }
  if (!card) {
    return apiError(404, "No such card.");
  }

  const { price: _price, market: _market, ...rest } = card;
  return NextResponse.json(
    { ...rest, price: null, market: null },
    {
      headers: {
        // Safe to share, unlike the keyed route: there is no key in the request
        // and nothing here that depends on who is asking, so a CDN holding this
        // for an hour is holding the same answer everyone gets.
        "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
