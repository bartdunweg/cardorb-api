import { NextResponse } from "next/server";
import { getCardDetail } from "../../../../../../lib/core/cards";
import { authorise, readHeaders, refused } from "../../../../../../lib/api/guard";

/**
 * One TCGdex card in full, by id — the second half of the add-card search.
 *
 * `/catalog/search` finds candidates inside a set with the eight fields
 * setCatalogue() carries; picking one needs the rest (rarity, types,
 * illustrator, hp, ...), which only getCardDetail()'s per-card fetch has. Kept
 * as its own route rather than folded into search, because search runs once
 * per keystroke and this runs once per click. See docs/decisions/0030-tcgdex-source-of-truth-for-rarity-and-type.md.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await authorise(req);
  if (refused(who)) {
    return NextResponse.json({ error: who.error }, { status: who.status, headers: readHeaders(req) });
  }

  const { id } = await params;
  const card = await getCardDetail(id);
  if (!card) {
    return NextResponse.json({ error: "No such card." }, { status: 404, headers: readHeaders(req) });
  }

  return NextResponse.json({ card }, { headers: readHeaders(req) });
}
