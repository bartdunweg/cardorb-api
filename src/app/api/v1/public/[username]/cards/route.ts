import { NextResponse } from "next/server";
import { apiError, PUBLIC_READ_CACHE, refuse, retryAfter } from "@/lib/api/respond";
import { getPublicCollection, ownerOf } from "@/lib/core/collection/collection";
import { publicPage, readPublicQuery } from "@/lib/core/collection/items";
import { createRateLimiter } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

/**
 * One page of a public collection as a flat list — for a page that shows a
 * hundred cards at a time and should not fetch nineteen hundred to do it.
 * The grouped whole stays at the sibling route. No key, same limiter and
 * cache as its siblings; a failed read is a 503 nothing caches.
 *
 * Narrows and sorts by the keyed list's rules (`set`, `rarity`, `sort`,
 * `order`), less a sort by price, which a page without prices refuses. The
 * page is cut in publicPage(), which is also the allow-list: it builds each
 * entry field by field from the assembly and publishes nothing of the copies.
 */
const byAddress = createRateLimiter(60_000, 60);

const addressOf = (req: Request) =>
  req.headers.get("x-real-ip")?.trim() ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown";

export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const wait = byAddress(addressOf(req));
  if (wait) return refuse("tooMany", { headers: retryAfter(wait) });

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

  return NextResponse.json(publicPage(sets, read.query), {
    headers: { "Cache-Control": PUBLIC_READ_CACHE },
  });
}
