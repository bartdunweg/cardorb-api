import { NextResponse } from "next/server";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";
import { getCards } from "@/lib/core/collection/collection";
import { summariseDex } from "@/lib/core/collection/items";
import { getPokedex } from "@/lib/core/collection/pokedex";

export const dynamic = "force-dynamic";

/**
 * Every National Pokédex slot with how many cards of it the caller owns and
 * one picture. The cards themselves are not in it: a 1,025-tile grid needs
 * a count and a thumbnail, and the list is `GET /v1/cards?q=`.
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
