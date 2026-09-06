import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/respond";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";
import { getCardPrices } from "@/lib/core/collection/collection";

/**
 * One card's price, day by day, over the last ninety days: the readings the
 * nightly cron writes for every held card (see cardPricesOf). A card nobody
 * holds has none, and an empty list is the honest answer rather than a 404:
 * the card exists, its history does not yet.
 *
 * Authorised like the card itself. Read through getCardPrices so the caller's
 * own hour of caching and the paged store read are the same as the movers'.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ tcgId: string }> }) {
  const who = await authorise(req);
  if (refused(who))
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });
  const { tcgId } = await params;
  const points = await getCardPrices(who.userId, [tcgId], bearer(req) ?? undefined);
  return NextResponse.json(
    { points: points.map((p) => ({ date: p.date, market: p.market, holo: p.holo })) },
    { headers: readHeaders(req) },
  );
}
