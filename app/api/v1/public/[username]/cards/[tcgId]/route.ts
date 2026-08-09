import { NextResponse } from "next/server";
import { getCardDetail } from "../../../../../../../lib/core/cards";
import { PUBLIC_USERNAME } from "../../../../../../../lib/core/config";

/**
 * One card, for the public link, without a price on it.
 *
 * The keyed twin of this route (/v1/cards/[tcgId]) carries the price and the
 * raw Cardmarket figures, which is exactly what /user/<name> goes out of its
 * way not to show. This one exists because the public page still needs to open
 * a card: it used to link to /cards/<id>, and the middleware in front of /cards
 * turned a visitor's tap on a scan into the login screen.
 *
 * Addressed by username rather than left open at /v1/public/cards/<id>, so the
 * route says whose collection it is answering for. Today there is one name and
 * it comes from an env var; when there are accounts, this is already the shape
 * that asks the right question, and the check below becomes a lookup.
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
  if (username !== PUBLIC_USERNAME) {
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
