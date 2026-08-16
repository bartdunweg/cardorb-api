import { NextResponse } from "next/server";
import { getCardDetail } from "../../../../../../../lib/core/cards";
import { ownerOf } from "../../../../../../../lib/core/collection";

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string; tcgId: string }> },
) {
  const { username, tcgId } = await params;
  if (!(await ownerOf(username))) {
    return NextResponse.json({ error: "No such collection." }, { status: 404 });
  }

  const card = await getCardDetail(tcgId);
  if (!card) {
    return NextResponse.json({ error: "No such card." }, { status: 404 });
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
