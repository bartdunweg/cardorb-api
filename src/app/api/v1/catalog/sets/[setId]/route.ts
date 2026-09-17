import { NextResponse } from "next/server";
import { apiError, refuse } from "@/lib/api/respond";
import { isBrowseLanguage, setIn } from "@/lib/core/catalogue/tcgdex-browse";
import { withOwnArt, withOwnScans } from "@/lib/core/catalogue/image-store";
import { languageSetFromCopy } from "@/lib/core/catalogue/set-catalogue-mirror";
import { mirrorScans } from "@/lib/core/catalogue/mirror";
import { adminClient } from "@/lib/storage/supabase";
import { getRows, tcgplayerPricesFor } from "@/lib/core/collection/collection";
import { markOwnership, ownershipIndex } from "@/lib/core/collection/ownership";
import { galleriesByParent } from "@/lib/core/catalogue/set-galleries";
import { englishSetOfDay, englishShelfSets } from "@/lib/core/catalogue/catalogue";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";
import { elapsed, logTiming, timed } from "@/lib/core/timing";

/**
 * One set, all of it, with the viewer's own cards marked.
 *
 * Paged in memory rather than at the source, and that is deliberate: the set
 * is read whole once and kept for a day (it is the same for everybody), so
 * slicing here costs nothing and buys two things a forwarded
 * page could not give — an exact `totalCount`, and an ownership mark that is
 * right for every card rather than for the twenty that happened to come back.
 *
 * The default page is 60 because that is roughly three screens of a grid. The
 * ceiling is 500, past any set with its gallery, so a client that wants the
 * whole set asks for pageSize=500 and gets it in one request. It was 250 until
 * 2026-09-14, and a Scarlet & Violet set then took two requests, each reading
 * the whole set again.
 */
export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 60;
const MAX_PAGE_SIZE = 500;

/** A positive integer from the query string, or the fallback. */
const intParam = (raw: string | null, fallback: number, max: number) => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
};

export async function GET(req: Request, { params }: { params: Promise<{ setId: string }> }) {
  const began = performance.now();
  const who = await authorise(req);
  if (refused(who)) {
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });
  }

  // Throwaway breakage to prove the web-e2e job catches it. Not for merge.
  if (req.headers.get("x-e2e-allow") !== "never-set")
    return apiError(500, "forced for e2e proof", undefined, { headers: readHeaders(req) });

  const { setId } = await params;
  const url = new URL(req.url);
  const page = intParam(url.searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
  const pageSize = intParam(url.searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  const language = url.searchParams.get("language");
  if (language && language !== "en" && !isBrowseLanguage(language))
    return apiError(400, "language must be en or ja.", undefined, {
      headers: readHeaders(req),
    });

  /* The viewer's rows do not wait on the catalogue: both are read at once. getRows never throws,
     it says `failed`, so a set that turns out not to exist leaves nothing unhandled. */
  const rowsRead = getRows(who.userId, bearer(req) ?? undefined);

  let set;
  let cards;
  try {
    if (isBrowseLanguage(language)) {
      /* Out of the copy, pictures resolved and kept in our bucket at night (mirror-language.ts).
         TCGdex only for a set the copy does not hold yet. */
      const copied = await languageSetFromCopy(language, setId).catch(() => null);
      if (copied) {
        set = copied.set;
        cards = copied.cards;
      } else {
        /* That language's catalogue: TCGdex has the set whole, facts and all. Not its pictures:
           the addresses it builds are not files of ours, so the set and its cards carry null
           until the nightly copy holds them (the answer below). The TCGdex HEAD and the
           Limitless guesses that stood here went on 2026-09-15. */
        const found = await setIn(language, setId);
        if (!found) return apiError(404, "No such set.", undefined, { headers: readHeaders(req) });
        set = found.set;
        cards = found.cards;
      }
    } else {
      /* TCGdex's own id, or pokemontcg.io's from before 2026-09-11, which the
         shelf still reads (tcgdex-browse.ts). An id nobody carries is a 404, not
         an empty set. */
      const found = await timed("set read", () => englishSetOfDay(setId));
      if (!found) return apiError(404, "No such set.", undefined, { headers: readHeaders(req) });
      /* The logo the shelf's tile shows, stored resolved in the copy (promo star, pokemontcg.io's
         wordmark) and kept in our bucket. A set the copy has not listed yet keeps the one its own
         read gave, which is a file of ours or null: nothing is asked of pokemontcg.io here. */
      const shelf = await timed("set shelf", () => englishShelfSets());
      const listed = shelf.find((s) => s.id === found.set.id);
      set = listed ? { ...found.set, logo: listed.logo } : found.set;
      cards = found.cards;
      /* The set's gallery after its own cards: TG01 to TG30 are part of Brilliant Stars on the
         shelf, as they are in the collection (set-galleries.ts). A gallery that cannot be read
         leaves the set as it is rather than failing the page. */
      const gallery = galleriesByParent(shelf).get(set.id);
      const inside = gallery
        ? await timed("set gallery", () => englishSetOfDay(gallery.id)).catch(() => null)
        : null;
      if (inside) {
        set = {
          ...set,
          total: set.total + inside.set.total,
          gallery: { name: inside.set.name.slice(set.name.length).trim(), total: inside.set.total },
        };
        cards = [...cards, ...inside.cards];
      }
    }
  } catch {
    return refuse("catalogue", { headers: readHeaders(req) });
  }

  const { rows, failed } = await timed("set rows", () => rowsRead);
  /* Keyed by the catalogue being shown. A row of that language carrying that catalogue's card
     id marks its own shelf exactly, by id; every other row marks the English one. Both
     directions matter, because a Japanese set named like an English one (Black Bolt) would
     otherwise be counted by the English cards, and was. */
  const index = ownershipIndex(
    rows,
    isBrowseLanguage(language) ? language : null,
    isBrowseLanguage(language) ? [] : await englishShelfSets(),
  );
  const marked = markOwnership(index, cards);
  const start = (page - 1) * pageSize;
  const onPage = marked.slice(start, start + pageSize);
  /* The pictures as the catalogue's copy has them, for the English shelf: this route builds a
     card's address from the serie, the set and the number, and TCGdex has no file behind it for
     a handful of cards a set (svp-085, Pikachu with Grey Felt Hat, among them). The copy has
     checked each of those and holds the second catalogue's file where there is one, in our
     bucket. One query for the page's ids, and no probe on this request. The copy holds no person's data, so it is the service role's to
     read, as the search reads it. */
  const copy = isBrowseLanguage(language) ? null : adminClient();
  const scansRead = copy
    ? mirrorScans(
        copy,
        onPage.map((c) => c.id),
      ).catch(() => null)
    : null;

  /* A price under every card, so a set page can be read the way the collection's own lists are
     rather than as a checklist. Only the page's cards, from TCGplayer's tcgcsv groups, each cached
     a day: the market every other price in the app is in since 2026-09-12. Keyed by the TCGdex
     id, which every shelf's cards carry; the fallback is for a card that came without one. The
     shelf is a fact about the page, not the id: a Japanese page prices from the Japanese shelf.
     The copy only swaps a card's pictures, never its ids, so the prices are asked for at the same
     time as the pictures rather than after them. */
  const priceKey = (c: (typeof onPage)[number]) => c.tcgId ?? c.id;
  const [scans, prices] = await timed("set scans and prices", () =>
    Promise.all([
      scansRead,
      tcgplayerPricesFor(onPage.map(priceKey), isBrowseLanguage(language) ? language : null),
    ]),
  );
  const shown = scans?.size ? onPage.map((c) => ({ ...c, ...(scans.get(c.id) ?? {}) })) : onPage;

  logTiming("route catalog/sets/:id", elapsed(began), `${cards.length} cards`);
  return NextResponse.json(
    {
      /* `abbreviation` always, null where unknown, so a client can print the code without
         telling a missing field from an empty one. Both reads fill it from the set's own TCGdex
         record, the source the collection's `setAbbr` is copied from too, so a set page and a
         collection tile print the same code. */
      set: withOwnArt({ ...set, abbreviation: set.abbreviation ?? null }),
      /* Every picture on the page a file of ours, or null (ownPicture in image-store.ts): Bart,
         2026-09-15. Whichever read answered, the copy or TCGdex for a set the copy does not hold
         yet, no other host's address leaves this route. */
      cards: shown.map((c) =>
        withOwnScans({
          ...c,
          price: prices.get(priceKey(c))?.price ?? null,
        }),
      ),
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
