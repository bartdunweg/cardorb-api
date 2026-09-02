import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/respond";
import { getPublicCollection, ownerOf } from "@/lib/core/collection/collection";
import { latestPull } from "@/lib/core/collection/cards";
import { createRateLimiter } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Cross-origin on purpose: this is the one public route a portfolio site on a
 * different domain is meant to fetch client-side. Safe to leave wide open
 * because it carries no auth, no cookies, and — per latestPull()'s curated
 * shape — no price or purchase data either.
 *
 * Allow-Methods/-Headers are here for the OPTIONS answer below rather than for
 * the GET: a plain fetch() of this URL is a simple request and never preflights,
 * but the day the portfolio adds a header it would otherwise fail with nothing
 * on the wire to explain why.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

/**
 * The public routes never go through authorise(), so this is the only throttle
 * in front of them. Generous on purpose: one widget behind the five-minute CDN
 * cache below should never come near 60, and anything that does is not a
 * portfolio page.
 */
const byAddress = createRateLimiter(60_000, 60);

const addressOf = (req: Request) =>
  // x-real-ip first: x-forwarded-for is client-spoofable. Same order as guard.ts.
  req.headers.get("x-real-ip")?.trim() ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  if (byAddress(addressOf(req)))
    return apiError(429, "Too many requests", undefined, { headers: CORS_HEADERS });

  const { username } = await params;
  const owner = await ownerOf(username);
  if (!owner)
    return apiError(404, "No such collection.", undefined, { headers: CORS_HEADERS });

  const { sets, failed } = await getPublicCollection(owner.id);
  if (failed)
    return NextResponse.json(
      { error: "The collection could not be read. Try again in a moment." },
      { status: 503, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } },
    );

  const pull = latestPull(sets);
  if (!pull) return apiError(404, "No card found.", undefined, { headers: CORS_HEADERS });

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
