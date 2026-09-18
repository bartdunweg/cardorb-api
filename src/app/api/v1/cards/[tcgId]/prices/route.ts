import { catalogueCardId } from "@/lib/api/card-id";
import { NextResponse } from "next/server";
import { apiError, unavailable } from "@/lib/api/respond";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";
import {
  ALL_READINGS,
  defaultPriceLanguage,
  getCardPrices,
} from "@/lib/core/collection/collection";
import { type PriceLanguage, PRICE_LANGUAGES } from "@/lib/core/price-months.mjs";
import { printingListingsOf } from "@/lib/core/collection/printing-listings";

/**
 * One card's price, day by day, as far back as there is a reading: the nightly
 * cron's readings for every held card (see cardPricesOf), and before those the
 * backfill's, TCGplayer's dollars turned into euros (scripts/backfill-card-prices.mjs).
 * A card nobody holds has none, and an empty list is the honest answer rather
 * than a 404: the card exists, its history does not yet.
 *
 * Which is exactly why a failed read may not answer the same thing. The reader
 * used to swallow its own error and hand back `[]`, so an unreachable store and
 * a card whose history has not started were one payload — and the sentence
 * above says what a client reads that payload as. `failed` now comes back
 * beside the points and is a 503 here, the same as everywhere else a read that
 * could not happen must not be drawn as an answer.
 *
 * Authorised like the card itself. Read through getCardPrices so the caller's
 * own hour of caching and the paged store read are the same as the movers'.
 *
 * `?language=en|ja` says which catalogue the id is from, since the two share ids: neo4-106 is
 * Shining Celebi in English and Lucky Stadium in Japanese, and each has its own line (migration
 * 20260915161000). Left out, the id's own catalogue answers where only one has it, and English
 * where both do (defaultPriceLanguage).
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ tcgId: string }> }) {
  const who = await authorise(req);
  if (refused(who))
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });
  const tcgId = catalogueCardId((await params).tcgId);
  const asked = new URL(req.url).searchParams.get("language");
  if (asked !== null && !(PRICE_LANGUAGES as readonly string[]).includes(asked))
    return apiError(400, "language must be en or ja.", undefined, { headers: readHeaders(req) });
  let language: PriceLanguage;
  try {
    language = (asked as PriceLanguage | null) ?? (await defaultPriceLanguage(tcgId));
  } catch (err) {
    console.error("The card's catalogue unreadable, no price history answered:", err);
    return unavailable(
      "That card's price history could not be read. Try again in a moment.",
      readHeaders(req),
    );
  }
  /* Beside the line, today's lowest listing of each printing TCGplayer lists and has no market
     figure for (printing-listings.ts): such a printing has no line, and a sheet pressing it shows
     its listing, labelled. A listing that cannot be read costs the listings, not the line. */
  const [{ points, failed }, listings] = await Promise.all([
    getCardPrices(who.userId, [{ tcgId, language }], bearer(req) ?? undefined, ALL_READINGS),
    printingListingsOf(tcgId, language).catch((err) => {
      console.error(`The printings' listings of ${tcgId} could not be read:`, err);
      return {} as Record<string, number>;
    }),
  ]);
  if (failed)
    return unavailable(
      "That card's price history could not be read. Try again in a moment.",
      readHeaders(req),
    );
  return NextResponse.json(
    // The reader answers for the ids it was asked; filtered once more here so a
    // wider cached answer can never be handed out as one card's line.
    {
      points: points
        .filter((p) => p.tcgId === tcgId && p.language === language)
        // `printings` since 2026-09-13: every printing's figure that day, where it was stored per
        // printing. Absent on a reading from before.
        .map((p) => ({
          date: p.date,
          market: p.market,
          holo: p.holo,
          ...(p.printings ? { printings: p.printings } : {}),
        })),
      // Since 2026-09-18, and only where a printing has one: absent reads as none.
      ...(Object.keys(listings).length ? { listings } : {}),
    },
    { headers: readHeaders(req) },
  );
}
