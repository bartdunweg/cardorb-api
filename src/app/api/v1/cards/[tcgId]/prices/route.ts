import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/respond";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";
import { ALL_READINGS, getCardPrices } from "@/lib/core/collection/collection";

/**
 * One card's price, day by day, as far back as there is a reading: the nightly
 * cron's readings for every held card (see cardPricesOf), and before those the
 * backfill's, TCGplayer's dollars turned into euros (scripts/backfill-card-prices.mjs).
 * A card nobody holds has none, and an empty list is the honest answer rather
 * than a 404: the card exists, its history does not yet.
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
  const points = await getCardPrices(who.userId, [tcgId], bearer(req) ?? undefined, ALL_READINGS);
  return NextResponse.json(
    // The reader answers for the ids it was asked; filtered once more here so a
    // wider cached answer can never be handed out as one card's line.
    {
      points: points
        .filter((p) => p.tcgId === tcgId)
        .map((p) => ({ date: p.date, market: p.market, holo: p.holo })),
    },
    { headers: readHeaders(req) },
  );
}
