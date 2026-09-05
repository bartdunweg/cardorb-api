import { NextResponse } from "next/server";
import { apiError, unavailable } from "@/lib/api/respond";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";
import { getCollection } from "@/lib/core/collection/collection";
import { summariseDex } from "@/lib/core/collection/items";
import { getPokedex } from "@/lib/core/collection/pokedex";

export const dynamic = "force-dynamic";

/**
 * Every National Pokédex slot with how many cards of it the caller owns, and
 * those cards as name and picture. The row-level facts are not in it: a
 * 1,025-tile grid needs a count and thumbnails, and the list is `GET /v1/cards`.
 */
export async function GET(req: Request) {
  const who = await authorise(req);
  if (refused(who))
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });

  const { sets, failed, catalogueUnavailable } = await getCollection(
    who.userId,
    bearer(req) ?? undefined,
  );
  if (failed) return unavailable(undefined, readHeaders(req));
  // Flagged during a TCGdex outage: the counts stand, the pictures do not.
  return NextResponse.json(
    {
      entries: summariseDex(getPokedex(sets)),
      ...(catalogueUnavailable ? { catalogueUnavailable } : {}),
    },
    { headers: readHeaders(req) },
  );
}
