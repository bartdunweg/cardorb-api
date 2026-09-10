import { NextResponse } from "next/server";
import { apiError, PUBLIC_READ_CACHE, refuse, retryAfter } from "@/lib/api/respond";
import { getPublicCollection, ownerOf } from "@/lib/core/collection/collection";
import { forGrid, forPublic } from "@/lib/core/collection/cards";
import type { CardSet } from "@/lib/core/collection/cards";
import { createRateLimiter } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The collection without the cards nobody owns yet.
 *
 * A card whose every variant is `owned: false` is a wish — the same reading
 * publicWishes() takes in collection/items.ts, and the one the sibling /cards
 * route serves behind `list=wishlist`. buildCollection() keeps wanted rows
 * beside held ones and forPublic() preserves `owned` on purpose (a public page
 * draws a wishlist tag from it), so nothing downstream of here removes them:
 * this route published somebody's wishlist whatever their `wishlistPublic` flag
 * said, and only happened not to leak because the one account's flag is on.
 *
 * A set left with no cards goes too. An empty set is not a fact about the
 * collection, it is the shape of what was taken out of it, and a grid of set
 * tiles would draw one.
 *
 * Local to the route rather than beside forPublic(), which is where it belongs:
 * this is the narrowing the route decides on, and moving it into cards.ts is a
 * change to a file two other branches are in.
 */
const ownedOnly = (sets: CardSet[]): CardSet[] =>
  sets
    .map((set) => ({ ...set, cards: set.cards.filter((c) => c.variants.some((v) => v.owned)) }))
    .filter((set) => set.cards.length > 0);

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
  const wait = byAddress(addressOf(req));
  if (wait) return refuse("tooMany", { headers: retryAfter(wait) });

  const { username } = await params;
  const owner = await ownerOf(username);
  if (!owner) return apiError(404, "No such collection.");
  const { sets, failed, catalogueUnavailable } = await getPublicCollection(owner.id);
  // Never cache a failure: the CDN would hand an empty collection to every
  // visitor for an hour, which is what happened once.
  if (failed)
    return NextResponse.json(
      { error: "The collection could not be read. Try again in a moment." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );

  // The wishlist is the owner's to show. Off — and off is the default — the
  // cards nobody owns yet never leave the building; the sibling /cards route
  // answers 404 "No such list." to the same question, which it can because the
  // question is asked there. Here there is nothing to refuse: it is one payload,
  // and the flag decides what is in it.
  const shown = owner.wishlistPublic ? sets : ownedOnly(sets);
  return NextResponse.json(
    { sets: forGrid(forPublic(shown)) },
    // An outage answer (no scans) is served but not cached, for the same reason.
    { headers: { "Cache-Control": catalogueUnavailable ? "no-store" : PUBLIC_READ_CACHE } },
  );
}
