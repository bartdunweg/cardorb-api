import { NextResponse } from "next/server";
import { getCards, ownerOf } from "../../../../../../lib/core/collection";
import { latestPull } from "../../../../../../lib/core/cards";

export const dynamic = "force-dynamic";

/**
 * Cross-origin on purpose: this is the one public route a portfolio site on a
 * different domain is meant to fetch client-side. Safe to leave wide open
 * because it carries no auth, no cookies, and — per latestPull()'s curated
 * shape — no price or purchase data either.
 */
const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const owner = await ownerOf(username);
  if (!owner)
    return NextResponse.json({ error: "No such collection." }, { status: 404, headers: CORS_HEADERS });

  const pull = latestPull(await getCards(owner));
  if (!pull) return NextResponse.json({ error: "No card found." }, { status: 404, headers: CORS_HEADERS });

  return NextResponse.json(
    { latestPull: pull },
    {
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
