import { NextResponse } from "next/server";
import { getCardDetail } from "../../../../../lib/core/cards";
import { readHeaders } from "../../../../../lib/api/guard";

/**
 * One card, by the id TCGdex gives it ("sv03-125").
 *
 * That id rather than the row's own key, for the reason the key exists: it
 * carries the set name, spaces, ampersands and the dash it is split on, so it
 * is a fine map key and a terrible URL. Not every row has a tcgId, and a card
 * that never matched a catalogue has no detail to serve, which is a 404 rather
 * than an empty object: nothing is a different answer from nothing found.
 */
export const revalidate = 3600;

export async function GET(_req: Request, { params }: { params: Promise<{ tcgId: string }> }) {
  const { tcgId } = await params;
  const card = await getCardDetail(tcgId);
  if (!card) {
    return NextResponse.json({ error: "No such card." }, { status: 404, headers: readHeaders });
  }
  return NextResponse.json(card, {
    headers: {
      ...readHeaders,
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
