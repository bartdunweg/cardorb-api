import { NextResponse } from "next/server";
import { apiError, PUBLIC_READ_CACHE } from "@/lib/api/respond";
import { getPublicCollection, ownerOf } from "@/lib/core/collection/collection";
import { forPublic } from "@/lib/core/collection/cards";
import { filterPublicItems, pageOf, publicItems, readPublicQuery } from "@/lib/core/collection/items";
import { createRateLimiter } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

/**
 * One page of a public collection as a flat list — for a page that shows a
 * hundred cards at a time and should not fetch nineteen hundred to do it.
 * The grouped whole stays at the sibling route. No key, same limiter and
 * cache as its siblings; a failed read is a 503 nothing caches.
 */
const byAddress = createRateLimiter(60_000, 60);

const addressOf = (req: Request) =>
  req.headers.get("x-real-ip")?.trim() ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown";

export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  if (byAddress(addressOf(req))) return apiError(429, "Too many requests");

  const read = readPublicQuery(new URL(req.url).searchParams);
  if (read.kind === "invalid") return apiError(400, read.error);

  const { username } = await params;
  const owner = await ownerOf(username);
  if (!owner) return apiError(404, "No such collection.");

  const { sets, failed } = await getPublicCollection(owner.id);
  if (failed)
    return apiError(503, "The collection could not be read. Try again in a moment.", undefined, {
      headers: { "Cache-Control": "no-store" },
    });

  const shown = forPublic(sets);
  const { items, total } = pageOf(filterPublicItems(publicItems(shown), read.query.q), read.query);
  // How many sets the owned cards span, for the line under the profile's name; a page of a
  // hundred cannot count that for itself, and the whole collection is what this route exists
  // to spare the reader.
  const setCount = shown.filter((set) => set.cards.some((card) => card.variants.some((v) => v.owned))).length;
  return NextResponse.json(
    { cards: items, total, sets: setCount },
    { headers: { "Cache-Control": PUBLIC_READ_CACHE } },
  );
}
