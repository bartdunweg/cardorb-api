import { NextResponse } from "next/server";
import { getCards, ownerOf } from "../../../../../../lib/core/collection";
import { forGrid, stripPrices } from "../../../../../../lib/core/cards";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const owner = await ownerOf(username);
  if (!owner) return NextResponse.json({ error: "No such collection." }, { status: 404 });
  return NextResponse.json(
    { sets: forGrid(stripPrices(await getCards(owner))) },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
