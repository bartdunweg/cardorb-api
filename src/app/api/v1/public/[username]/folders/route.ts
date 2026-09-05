import { NextResponse } from "next/server";
import { apiError, PUBLIC_READ_CACHE, refuse, retryAfter } from "@/lib/api/respond";
import { createRateLimiter } from "@/lib/api/rate-limit";
import {
  getPublicCollection,
  getPublicFolders,
  ownerOf,
} from "@/lib/core/collection/collection";
import { filterItems, flattenItems } from "@/lib/core/collection/items";

export const dynamic = "force-dynamic";

/**
 * The folders a person shows on their public profile, each with how many cards it holds.
 *
 * Only folders their owner marked public, and only while the profile is public: ownerOf()
 * answers null for a private one, the same 404 every route under this prefix gives. The
 * count is cards with an owned copy, not copies, since that is what the public list shows
 * and what a filter chip beside it should say. Counting needs the assembled collection, which
 * the public cards route reads anyway, from the same cache.
 */
const byAddress = createRateLimiter(60_000, 60);

const addressOf = (req: Request) =>
  req.headers.get("x-real-ip")?.trim() ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown";

export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const wait = byAddress(addressOf(req));
  if (wait) return refuse("tooMany", { headers: retryAfter(wait) });

  const { username } = await params;
  const owner = await ownerOf(username);
  if (!owner) return apiError(404, "No such collection.");

  const folders = await getPublicFolders(owner.id);
  if (folders.length === 0)
    return NextResponse.json({ folders: [] }, { headers: { "Cache-Control": PUBLIC_READ_CACHE } });

  const { sets, failed, catalogueUnavailable } = await getPublicCollection(owner.id);
  if (failed)
    return apiError(503, "The collection could not be read. Try again in a moment.", undefined, {
      headers: { "Cache-Control": "no-store" },
    });

  // The match runs on the private items, which know their folder and their rule's facts (the
  // public shape has neither); only the count of distinct cards comes out.
  const items = flattenItems(sets);
  const listed = folders.map((f) => {
    const filter = f.rule ? { owned: undefined, rule: f.rule } : { owned: true, collection: f.id };
    const count = new Set(filterItems(items, filter).map((it) => `${it.set}-${it.number || it.name}`)).size;
    return { id: f.id, name: f.name, kind: f.kind, count };
  });

  return NextResponse.json(
    { folders: listed },
    // A count made without the catalogue is a low one; the CDN must not keep it.
    { headers: { "Cache-Control": catalogueUnavailable ? "no-store" : PUBLIC_READ_CACHE } },
  );
}
