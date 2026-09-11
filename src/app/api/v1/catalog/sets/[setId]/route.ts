import { NextResponse } from "next/server";
import { apiError, refuse } from "@/lib/api/respond";
import {
  englishSet,
  englishSets,
  isBrowseLanguage,
  setIn,
} from "@/lib/core/catalogue/tcgdex-browse";
import { withLimitlessScans } from "@/lib/core/catalogue/browse-artwork";
import { getRows, guidePricesFor } from "@/lib/core/collection/collection";
import { markOwnership, ownershipIndex } from "@/lib/core/collection/ownership";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";

/**
 * One set, all of it, with the viewer's own cards marked.
 *
 * Paged in memory rather than at the source, and that is deliberate: the set
 * is read whole once and kept for a day (it is the same for everybody), so
 * slicing here costs nothing and buys two things a forwarded
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

  const language = url.searchParams.get("language");
  if (language && language !== "en" && !isBrowseLanguage(language))
    return apiError(400, "language must be en, ja, zh-tw, zh-cn or ko.", undefined, {
      headers: readHeaders(req),
    });

  let set;
  let cards;
  try {
    if (isBrowseLanguage(language)) {
      // That language's catalogue, pictures and all: TCGdex has the set whole.
      const found = await setIn(language, setId);
      if (!found) return apiError(404, "No such set.", undefined, { headers: readHeaders(req) });
      set = found.set;
      /* TCGdex has the set whole and, on the Japanese shelf, often none of its pictures —
         whole sets at a time. Limitless has those; see browse-artwork.ts for the count. */
      cards = await withLimitlessScans(language, found.cards);
    } else {
      /* TCGdex's own id, or pokemontcg.io's from before 2026-09-11, which the
         shelf still reads (tcgdex-browse.ts). An id nobody carries is a 404, not
         an empty set. */
      const found = await englishSet(setId);
      if (!found) return apiError(404, "No such set.", undefined, { headers: readHeaders(req) });
      set = found.set;
      cards = found.cards;
    }
  } catch {
    return refuse("catalogue", { headers: readHeaders(req) });
  }

  const { rows, failed } = await getRows(who.userId, bearer(req) ?? undefined);
  /* Keyed by the catalogue being shown. A row of that language carrying that catalogue's card
     id marks its own shelf exactly, by id; every other row marks the English one. Both
     directions matter, because a Japanese set named like an English one (Black Bolt) would
     otherwise be counted by the English cards, and was. */
  const index = ownershipIndex(
    rows,
    isBrowseLanguage(language) ? language : null,
    isBrowseLanguage(language) ? [] : await englishSets(),
  );
  const marked = markOwnership(index, cards);
  const start = (page - 1) * pageSize;
  const shown = marked.slice(start, start + pageSize);

  /* A price under every card, so a set page can be read the way the collection's own lists are
     rather than as a checklist. Only the page's cards are priced, and only from the guide that
     is already cached for the day: the whole set would be up to 250 lookups, and the TCGdex
     fallback behind them would be a request each for the many cards Cardmarket does not price. */
  /* Keyed by the TCGdex id. Every shelf's cards are TCGdex's now, so `tcgId` and `id` agree;
     the fallback is for a card that came without the one. */
  /* From that catalogue's own map. A Japanese set page showed a blank line under all 92 cards
     of M1S while the guide priced every one of them: the only map from a card to its Cardmarket
     product held English cards somebody owns. Which map to read is a fact about the page, not
     the id — SM1S-001 is a Japanese card and a different Korean one. */
  const priceKey = (c: (typeof shown)[number]) => c.tcgId ?? c.id;
  const prices = await guidePricesFor(
    shown.map(priceKey),
    isBrowseLanguage(language) ? language : null,
  );

  return NextResponse.json(
    {
      set,
      cards: shown.map((c) => ({
        ...c,
        price: prices.get(priceKey(c))?.price ?? null,
        priceHolo: prices.get(priceKey(c))?.holo ?? null,
      })),
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
