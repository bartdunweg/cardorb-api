import { NextResponse } from "next/server";
import { json } from "../../../../../lib/core/catalogue";
import type { TcgSet } from "../../../../../lib/core/catalogue";
import { authorise, readHeaders, refused } from "../../../../../lib/api/guard";

/**
 * The full TCGdex set index, for the add-card set picker.
 *
 * The same fetch loadSetCatalogue() makes on a cache miss (see catalogue.ts),
 * called directly rather than through setCatalogue(): this route wants the
 * index itself, not one set resolved out of it, and json()'s own day-long
 * fetch cache already makes a second caller here free.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const who = await authorise(req);
  if (refused(who)) {
    return NextResponse.json({ error: who.error }, { status: who.status, headers: readHeaders(req) });
  }

  let sets: TcgSet[] = [];
  try {
    sets = (await json("https://api.tcgdex.net/v2/en/sets", "sets index")) as TcgSet[];
  } catch {
    return NextResponse.json({ error: "TCGdex is unavailable." }, { status: 502, headers: readHeaders(req) });
  }

  const out = [...sets].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ id: s.id, name: s.name }));
  return NextResponse.json({ sets: out }, { headers: readHeaders(req) });
}
