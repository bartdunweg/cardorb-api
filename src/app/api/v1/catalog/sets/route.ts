import { NextResponse } from "next/server";
import { apiError, refuse } from "@/lib/api/respond";
import { isBrowseLanguage, listSetsIn } from "@/lib/core/catalogue/tcgdex-browse";
import { englishShelfSets } from "@/lib/core/catalogue/catalogue";
import { getRows } from "@/lib/core/collection/collection";
import { ownershipIndex, setCounts } from "@/lib/core/collection/ownership";
import { galleriesByParent, withoutFoldedGalleries } from "@/lib/core/catalogue/set-galleries";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";
import { elapsed, logTiming, timed } from "@/lib/core/timing";

/**
 * Every set there is, not every set you own.
 *
 * That distinction is the whole feature. /api/v1/collection and
 * /collection/sets both answer "your sets", and there was no way to ask the
 * other question at all: what is in a set you have three cards from, or none.
 * The iOS app wants to browse; this is the shelf it browses.
 *
 * Each set carries the viewer's own counts, which is why it is behind
 * authorise() rather than public. The catalogue half is nobody's secret — it is
 * held for a day and shared by everybody, see tcgdex-browse.ts — but "12 of
 * 207" is, and a route that answers differently per caller has no business
 * being cacheable at the edge. Hence readHeaders()'s `private, no-store`, the
 * same as every other guarded read here.
 *
 * A previous session had a /api/v1/catalog/sets that was deleted (see
 * once planned): a TCGdex-backed set picker in front of the add-card dialog, made
 * redundant by the one-box search. Same path, different job —
 * nothing here feeds the add form. The decision record has the long version.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const began = performance.now();
  const who = await authorise(req);
  if (refused(who)) {
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });
  }

  // `?language=ja`: the Japanese catalogue (TCGdex); left out, English.
  const language = new URL(req.url).searchParams.get("language");
  if (language && language !== "en" && !isBrowseLanguage(language))
    return apiError(400, "language must be en or ja.", undefined, {
      headers: readHeaders(req),
    });
  let sets;
  try {
    // The English shelf with the promo star and pokemontcg.io's wordmark where TCGdex has none
    // (set-logos.ts): asked here and on a set's page, not in the index search and the collection read.
    sets = isBrowseLanguage(language)
      ? await listSetsIn(language)
      : await timed("shelf sets", () => englishShelfSets());
  } catch {
    /* Distinct from an empty list, and distinct from a 500: the catalogue
       refused, the request is worth retrying, and the client can say so. The
       one sentence every catalogue route sends, from REFUSALS. */
    return refuse("catalogue", { headers: readHeaders(req) });
  }

  /* A store outage costs the ownership marks, not the shelf. getRows() already
     fails soft and says which happened, so `failed` is passed on rather than
     swallowed — a client that shows "0 of 207" everywhere should be able to
     tell that apart from a genuinely empty collection. */
  const { rows, failed } = await timed("shelf rows", () =>
    getRows(who.userId, bearer(req) ?? undefined),
  );
  const joined = performance.now();
  /* Keyed by the catalogue being shown. A row of that language carrying that catalogue's card
     id marks its own shelf exactly, by id; every other row marks the English one. Both
     directions matter, because a Japanese set named like an English one (Black Bolt) would
     otherwise be counted by the English cards, and was. */
  const index = ownershipIndex(rows, isBrowseLanguage(language) ? language : null, sets);

  /* On the English shelf a Trainer Gallery or Galarian Gallery is part of its set, not a tile of
     its own (set-galleries.ts): its cards and counts are added to the parent's. The index above
     still knows the gallery, which is how a TG row is counted for it. */
  const galleries = isBrowseLanguage(language) ? new Map() : galleriesByParent(sets);
  const shown = withoutFoldedGalleries(sets, galleries);

  const body = {
    sets: shown.map((set) => {
      const own = setCounts(index, set);
      const gallery = galleries.get(set.id);
      if (!gallery) return { ...set, ...own };
      const theirs = setCounts(index, gallery);
      return {
        ...set,
        total: set.total + gallery.total,
        // What of `total` is the gallery, so a client can say "30 Trainer Gallery" and not count
        // the gallery as secret rares past the printed number.
        gallery: { name: gallery.name.slice(set.name.length).trim(), total: gallery.total },
        ownedCount: own.ownedCount + theirs.ownedCount,
        wishlistCount: own.wishlistCount + theirs.wishlistCount,
      };
    }),
    ...(failed ? { collectionUnavailable: true } : {}),
  };
  logTiming("shelf join", elapsed(joined), `${rows.length} rows ${sets.length} sets`);
  // Every step timed on its own and the route as a whole beside them, so time no step accounts
  // for shows as the difference (2026-09-14: steps summed to 0.2 s of a 1 s answer).
  logTiming("route catalog/sets", elapsed(began));
  return NextResponse.json(body, { headers: readHeaders(req) });
}
