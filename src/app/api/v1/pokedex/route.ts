import { NextResponse } from "next/server";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";
import { getCards } from "@/lib/core/collection/collection";
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
    return NextResponse.json(
      { error: who.error },
      { status: who.status, headers: readHeaders(req) },
    );

  const sets = await getCards(who.userId, bearer(req) ?? undefined);
  return NextResponse.json(
    { entries: summariseDex(getPokedex(sets)) },
    { headers: readHeaders(req) },
  );
}
