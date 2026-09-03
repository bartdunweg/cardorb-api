import { NextResponse } from "next/server";
import { apiError, refuse } from "@/lib/api/respond";
import { findSet, setCards } from "@/lib/core/catalogue/ptcg-browse";
import { withTcgdexScans } from "@/lib/core/catalogue/browse-artwork";
import { getRows } from "@/lib/core/collection/collection";
import { markOwnership, ownershipIndex } from "@/lib/core/collection/ownership";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";

/**
 * One set, all of it, with the viewer's own cards marked.
 *
 * Paged in memory rather than at the source, and that is deliberate: setCards()
 * fetches the whole set once and keeps it for a day (it is the same for
 * everybody), so slicing here costs nothing and buys two things a forwarded
 * page could not give — an exact `totalCount`, and an ownership mark that is
 * right for every card rather than for the twenty that happened to come back.
 *
 * The default page is 60 because that is roughly three screens of a grid; the
 * ceiling is the catalogue's own 250. A client that wants the whole set in one
 * request asks for pageSize=250 and gets it.
 */
export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 60;
const MAX_PAGE_SIZE = 250;

/** A positive integer from the query string, or the fallback. */
const intParam = (raw: string | null, fallback: number, max: number) => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
};

export async function GET(req: Request, { params }: { params: Promise<{ setId: string }> }) {
  const who = await authorise(req);
  if (refused(who)) {
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });
  }

  const { setId } = await params;
  const url = new URL(req.url);
  const page = intParam(url.searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
  const pageSize = intParam(url.searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  let set;
  let cards;
  try {
    set = await findSet(setId);
    /* Checked before the cards are asked for: an id nobody carries is a 404, not
       an empty set, and finding that out from a card list that came back with
       nothing would conflate the two. */
    if (!set) {
      return apiError(404, "No such set.", undefined, { headers: readHeaders(req) });
    }
    /* pokemontcg.io answers what is in the set; TCGdex, where it has the same
       card, answers it with a picture a seventh of the size. See
       browse-artwork.ts for the measurement — it fails soft, so this cannot be
       the thing that 502s below. */
    cards = await withTcgdexScans(set, await setCards(setId));
  } catch {
    return refuse("catalogue", { headers: readHeaders(req) });
  }

  const { rows, failed } = await getRows(who.userId, bearer(req) ?? undefined);
  const index = ownershipIndex(rows);
  const marked = markOwnership(index, cards);
  const start = (page - 1) * pageSize;

  return NextResponse.json(
    {
      set,
      cards: marked.slice(start, start + pageSize),
      page,
      pageSize,
      totalCount: marked.length,
      /* Over the whole set, not over the page — the count a header wants to
         show is "12 of 207", and a page of 60 cannot answer it. */
      ownedCount: marked.filter((c) => c.owned).length,
      hasMore: start + pageSize < marked.length,
      ...(failed ? { collectionUnavailable: true } : {}),
    },
    { headers: readHeaders(req) },
  );
}
