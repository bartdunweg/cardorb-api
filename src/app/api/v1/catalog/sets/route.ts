import { NextResponse } from "next/server";
import { apiError, refuse } from "@/lib/api/respond";
import { listSets } from "@/lib/core/catalogue/ptcg-browse";
import { isBrowseLanguage, listSetsIn } from "@/lib/core/catalogue/tcgdex-browse";
import { getRows } from "@/lib/core/collection/collection";
import { ownershipIndex, setCounts } from "@/lib/core/collection/ownership";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";

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
 * cached for a day and shared by everybody, see ptcg-browse.ts — but "12 of
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
  const who = await authorise(req);
  if (refused(who)) {
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });
  }

  // `?language=ja|zh-tw|zh-cn|ko`: that language's own catalogue (TCGdex); left out, English.
  const language = new URL(req.url).searchParams.get("language");
  if (language && language !== "en" && !isBrowseLanguage(language))
    return apiError(400, "language must be en, ja, zh-tw, zh-cn or ko.", undefined, {
      headers: readHeaders(req),
    });
  let sets;
  try {
    sets = isBrowseLanguage(language) ? await listSetsIn(language) : await listSets();
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
  const { rows, failed } = await getRows(who.userId, bearer(req) ?? undefined);
  /* Keyed by the catalogue being shown. A row of that language carrying that catalogue's card
     id marks its own shelf exactly, by id; every other row marks the English one. Both
     directions matter, because a Japanese set named like an English one (Black Bolt) would
     otherwise be counted by the English cards, and was. */
  const index = ownershipIndex(rows, isBrowseLanguage(language) ? language : null);

  return NextResponse.json(
    {
      sets: sets.map((set) => ({ ...set, ...setCounts(index, set) })),
      ...(failed ? { collectionUnavailable: true } : {}),
    },
    { headers: readHeaders(req) },
  );
}
