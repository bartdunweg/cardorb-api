import { NextResponse } from "next/server";
import { apiError, refuse } from "@/lib/api/respond";
import { isBrowseLanguage, listSetsIn } from "@/lib/core/catalogue/tcgdex-browse";
import { copiedLanguageSets } from "@/lib/core/catalogue/set-catalogue-mirror";
import { englishShelfSets } from "@/lib/core/catalogue/catalogue";
import { withOwnArt } from "@/lib/core/catalogue/image-store";
import { getRows } from "@/lib/core/collection/collection";
import { ownershipIndex, setCounts } from "@/lib/core/collection/ownership";
import { galleriesByParent, withoutFoldedGalleries } from "@/lib/core/catalogue/set-galleries";
import { authoriseOpen, openReadHeaders, readHeaders, refused } from "@/lib/api/guard";
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
 * Each set carries the viewer's own counts where there is a viewer. The
 * catalogue half is nobody's secret (it is held for a day and shared by
 * everybody, see tcgdex-browse.ts), but "12 of 207" is, and an answer that
 * differs per caller has no business being cacheable at the edge. So the
 * headers follow the answer, not the route: readHeaders()'s `private,
 * no-store` once the counts are on it, openReadHeaders() when they are not.
 *
 * A previous session had a /api/v1/catalog/sets that was deleted (see
 * once planned): a TCGdex-backed set picker in front of the add-card dialog, made
 * redundant by the one-box search. Same path, different job:
 * nothing here feeds the add form. The decision record has the long version.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const began = performance.now();
  /* Nobody is allowed here: the shelf minus the counts is the catalogue, and
     the catalogue is nobody's secret. A credential that is offered still has to
     verify, so a viewer whose session ran out is refused rather than quietly
     shown a shelf with their own collection missing from it. */
  const who = await authoriseOpen(req);
  if (who && refused(who)) {
    /* A refusal is never cached, whoever asked, so it keeps readHeaders(). */
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });
  }
  const headers = who ? readHeaders(req) : openReadHeaders(req);

  // `?language=ja`: the Japanese catalogue (TCGdex); left out, English.
  const language = new URL(req.url).searchParams.get("language");
  if (language && language !== "en" && !isBrowseLanguage(language))
    return apiError(400, "language must be en or ja.", undefined, { headers });
  let sets;
  try {
    // The English shelf with the promo star and pokemontcg.io's wordmark where TCGdex has none,
    // resolved at night and kept in our bucket (set-logos.ts, mirror.ts).
    sets = isBrowseLanguage(language)
      ? // Out of the copy (mirror-language.ts); TCGdex only while the copy holds none of it.
        ((await copiedLanguageSets(language).catch(() => null)) ?? (await listSetsIn(language)))
      : await timed("shelf sets", () => englishShelfSets());
  } catch {
    /* Distinct from an empty list, and distinct from a 500: the catalogue
       refused, the request is worth retrying, and the client can say so. The
       one sentence every catalogue route sends, from REFUSALS. */
    return refuse("catalogue", { headers });
  }

  /* A store outage costs the ownership marks, not the shelf. getRows() already
     fails soft and says which happened, so `failed` is passed on rather than
     swallowed: a client that shows "0 of 207" everywhere should be able to
     tell that apart from a genuinely empty collection.

     Nobody asking means nobody's rows to read, so the store is not touched at
     all. That is most of what makes the open answer cheap. */
  const held = who
    ? await timed("shelf rows", () => getRows(who.userId, bearer(req) ?? undefined))
    : null;
  const joined = performance.now();
  /* Keyed by the catalogue being shown. A row of that language carrying that catalogue's card
     id marks its own shelf exactly, by id; every other row marks the English one. Both
     directions matter, because a Japanese set named like an English one (Black Bolt) would
     otherwise be counted by the English cards, and was. */
  const index = held
    ? ownershipIndex(held.rows, isBrowseLanguage(language) ? language : null, sets)
    : null;

  /* On the English shelf a Trainer Gallery or Galarian Gallery is part of its set, not a tile of
     its own (set-galleries.ts): its cards and counts are added to the parent's. The index above
     still knows the gallery, which is how a TG row is counted for it. */
  const galleries = isBrowseLanguage(language) ? new Map() : galleriesByParent(sets);
  const shown = withoutFoldedGalleries(sets, galleries);

  const body = {
    /* Every wordmark a file of ours, or null (ownPicture in image-store.ts): whichever read
       answered, no other host's address leaves this route (Bart, 2026-09-15). */
    sets: shown.map(withOwnArt).map((set) => {
      /* Spread, not zeroed. With no index there is no answer to "how many of
         these do you own", and a 0 would be one: a reader who is nobody must
         be able to tell "none" from "not asked". */
      const own = index ? setCounts(index, set) : null;
      const gallery = galleries.get(set.id);
      if (!gallery) return { ...set, ...own };
      const theirs = index ? setCounts(index, gallery) : null;
      return {
        ...set,
        total: set.total + gallery.total,
        // What of `total` is the gallery, so a client can say "30 Trainer Gallery" and not count
        // the gallery as secret rares past the printed number.
        gallery: { name: gallery.name.slice(set.name.length).trim(), total: gallery.total },
        ...(own && theirs
          ? {
              ownedCount: own.ownedCount + theirs.ownedCount,
              wishlistCount: own.wishlistCount + theirs.wishlistCount,
            }
          : {}),
      };
    }),
    ...(held?.failed ? { collectionUnavailable: true } : {}),
  };
  logTiming("shelf join", elapsed(joined), `${held?.rows.length ?? 0} rows ${sets.length} sets`);
  // Every step timed on its own and the route as a whole beside them, so time no step accounts
  // for shows as the difference (2026-09-14: steps summed to 0.2 s of a 1 s answer).
  logTiming("route catalog/sets", elapsed(began));
  return NextResponse.json(body, { headers });
}
