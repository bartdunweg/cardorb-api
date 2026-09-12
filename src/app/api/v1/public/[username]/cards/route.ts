import { NextResponse } from "next/server";
import { apiError, PUBLIC_READ_CACHE, refuse, retryAfter } from "@/lib/api/respond";
import { getPublicCollection, getPublicFolders, ownerOf } from "@/lib/core/collection/collection";
import { forPublic } from "@/lib/core/collection/cards";
import {
  filterItems,
  filterPublicItems,
  flattenItems,
  pageOf,
  publicFacets,
  publicItems,
  publicWishes,
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
  const wait = byAddress(addressOf(req));
  if (wait) return refuse("tooMany", { headers: retryAfter(wait) });

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
  // A list beside the collection only for an owner who shows it; asked of one who does not, the
  // same 404 as a folder nobody shows. A folder and a list do not combine: a wish is in no
  // folder, and the favorites are the whole collection seen another way. A Pokédex was a list
  // here until 2026-09-12 and is a binder now, so it comes through as a folder.
  const { list } = read.query;
  const listShown = list === "wishlist" ? owner.wishlistPublic : list === "favorites" ? owner.favoritesPublic : true;
  if (!listShown) return apiError(404, "No such list.");
  // The star is a fact about the owner's copy, so forPublic() strips it with the rest; it is read
  // here off the private items, the way a folder's contents are below, and only when the owner
  // shows the favorites. Everyone else gets a list on which nothing is starred.
  const sameCard = (it: { set: string; number: string; name: string }) =>
    `${it.set}\u0000${it.number}\u0000${it.name}`;
  const starred = owner.favoritesPublic
    ? new Set(filterItems(flattenItems(sets), { owned: true, favorite: true }).map(sameCard))
    : new Set<string>();
  // How many of each card the owner holds, off the private rows the way `starred` is: the
  // public shape carries no quantity (forPublic, by design), so an item built from it could
  // only count rows — 1,915 for 1,933 held, on 2026-09-11. The sum per card is what the page
  // has always said under a card, and says nothing a row's condition or grade would.
  const held = new Map<string, number>();
  for (const it of filterItems(flattenItems(sets), { owned: true }))
    held.set(sameCard(it), (held.get(sameCard(it)) ?? 0) + Math.max(0, it.quantity));
  // Newest first is built here, not sorted later: only these items still know their dates, and
  // the dates do not go out with them.
  const owned = publicItems(shown, { newestFirst: read.query.sort === "added" }).map((it) => ({
    ...it,
    copies: held.get(sameCard(it)) ?? it.copies,
    favorite: starred.has(sameCard(it)),
  }));
  const all =
    list === "wishlist"
      ? publicWishes(shown)
      : list === "favorites"
        ? owned.filter((it) => it.favorite)
        : owned;

  // A folder narrows the page to what it holds: the copies filed in it, or the owned copies
  // its rule matches. Only a folder its owner shows; any other id is a 404, the same answer
  // as a folder that does not exist, so a visitor cannot tell one from the other. The match
  // runs on the private items, which know their folder and their rule's facts, and only the
  // card keys come across to the public list.
  let listed = all;
  if (read.query.collection && !list) {
    const folder = (await getPublicFolders(owner.id)).find((f) => f.id === read.query.collection);
    if (!folder) return apiError(404, "No such folder.");
    const filter = folder.rule
      ? { owned: undefined, rule: folder.rule }
      : { owned: true, collection: folder.id };
    // A copy names its card the way the assembly keys it (cards.ts): the set, then the number or the name.
    const keys = new Set(
      filterItems(flattenItems(sets), filter).map((it) => `${it.set}-${it.number || it.name}`),
    );
    listed = all.filter((it) => keys.has(it.key));
  }

  const { sort, order } = read.query;
  const ordered = sortPublicItems(filterPublicItems(listed, read.query), sort, order);
  const { items, total } = pageOf(ordered, read.query);
  // The list as a person counts it — every copy held — which is what the line under the name
  // says; `total` is the rows a page walks through. See countCopies() in items.ts.
  let copies = 0;
  for (const it of ordered) copies += it.copies;
  // How many sets the owned cards span, for the line under the profile's name; a page of a
  // hundred cannot count that for itself, and the whole collection is what this route exists
  // to spare the reader.
  const setCount = shown.filter((set) => set.cards.some((card) => card.variants.some((v) => v.owned))).length;
  return NextResponse.json(
    { cards: items, total, copies, sets: setCount, facets: publicFacets(all) },
    // A page without scans is an outage answer, not the collection; the CDN
    // must not hand it out for the minute after TCGdex comes back.
    { headers: { "Cache-Control": catalogueUnavailable ? "no-store" : PUBLIC_READ_CACHE } },
  );
}
