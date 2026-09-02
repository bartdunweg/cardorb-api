import { NextResponse } from "next/server";
import { getPublicCollection, ownerOf } from "@/lib/core/collection/collection";
import { forGrid, forPublic } from "@/lib/core/collection/cards";
import { createRateLimiter } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The public routes never go through authorise(), so this is the only throttle
 * in front of them. Same limiter as latest-pull's — this one is also unauthenticated
 * and is the most expensive of the two (walks the full catalogue match).
 */
const byAddress = createRateLimiter(60_000, 60);

const addressOf = (req: Request) =>
  // x-real-ip first: x-forwarded-for is client-spoofable. Same order as guard.ts.
  req.headers.get("x-real-ip")?.trim() ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown";

export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  if (byAddress(addressOf(req))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { username } = await params;
  const owner = await ownerOf(username);
  if (!owner) return NextResponse.json({ error: "No such collection." }, { status: 404 });
  const { sets, failed } = await getPublicCollection(owner.id);
  // Never cache a failure: the CDN would hand an empty collection to every
  // visitor for an hour, which is what happened once.
  if (failed)
    return NextResponse.json(
      { error: "The collection could not be read. Try again in a moment." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );

  return NextResponse.json(
    { sets: forGrid(forPublic(sets)) },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
