import { NextResponse } from "next/server";
import { getCardDetail } from "../../../../../lib/core/cards";
import { readHeaders, refuseUnauthorised } from "../../../../../lib/api/guard";

/**
 * One card, by the id TCGdex gives it ("sv03-125").
 *
 * That id rather than the row's own key, for the reason the key exists: it
 * carries the set name, spaces, ampersands and the dash it is split on, so it
 * is a fine map key and a terrible URL. Not every row has a tcgId, and a card
 * that never matched a catalogue has no detail to serve, which is a 404 rather
 * than an empty object: nothing is a different answer from nothing found.
 *
 * Behind the key, like every read here now. This one carries a price and the
 * raw Cardmarket figures it came from, which is exactly what the public page
 * goes out of its way not to show; leaving it open would be an easier way to
 * ask than reading the page it was hidden from.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ tcgId: string }> }) {
  const refusal = refuseUnauthorised(req);
  if (refusal) {
    return NextResponse.json({ error: refusal.error }, { status: refusal.status });
  }

  const { tcgId } = await params;
  const card = await getCardDetail(tcgId);
  if (!card) {
    return NextResponse.json(
      { error: "No such card." },
      { status: 404, headers: readHeaders(req) },
    );
  }
  // The hour of shared caching this used to carry is gone with the lock: a CDN
  // holding one person's answer and handing it to the next asker without a key
  // would undo the check above. getCardDetail memoises upstream, so what this
  // costs is the round trip, not the walk.
  return NextResponse.json(card, { headers: readHeaders(req) });
}
