import { NextResponse } from "next/server";
import { apiError, PUBLIC_READ_CACHE } from "@/lib/api/respond";
import { getPublicCollection, ownerOf } from "@/lib/core/collection/collection";
import { forPublic } from "@/lib/core/collection/cards";
import {
  filterPublicItems,
  pageOf,
  publicFacets,
  publicItems,
  readPublicQuery,
  sortPublicItems,
} from "@/lib/core/collection/items";
import { createRateLimiter } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

/**
 * One page of a public collection as a flat list — for a page that shows a
 * hundred cards at a time and should not fetch nineteen hundred to do it —
 * narrowed by a search, a set or a rarity and sorted by set order or name,
 * with the facets a filter menu needs over the whole collection. The
 * grouped whole stays at the sibling route. No key, same limiter and cache
 * as its siblings; a failed read is a 503 nothing caches.
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

  const { sets, failed, catalogueUnavailable } = await getPublicCollection(owner.id);
  if (failed)
    return apiError(503, "The collection could not be read. Try again in a moment.", undefined, {
      headers: { "Cache-Control": "no-store" },
    });

  const shown = forPublic(sets);
  const all = publicItems(shown);
  const { sort, order } = read.query;
  const { items, total } = pageOf(
    sortPublicItems(filterPublicItems(all, read.query), sort, order),
    read.query,
  );
  // How many sets the owned cards span, for the line under the profile's name; a page of a
  // hundred cannot count that for itself, and the whole collection is what this route exists
  // to spare the reader.
  const setCount = shown.filter((set) => set.cards.some((card) => card.variants.some((v) => v.owned))).length;
  return NextResponse.json(
    { cards: items, total, sets: setCount, facets: publicFacets(all) },
    // A page without scans is an outage answer, not the collection; the CDN
    // must not hand it out for the minute after TCGdex comes back.
    { headers: { "Cache-Control": catalogueUnavailable ? "no-store" : PUBLIC_READ_CACHE } },
  );
}
