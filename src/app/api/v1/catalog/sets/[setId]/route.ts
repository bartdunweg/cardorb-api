import { NextResponse } from "next/server";
import { classicNumberOf } from "@/lib/core/catalogue/set-codes";
import { apiError, refuse } from "@/lib/api/respond";
import { isBrowseLanguage, setIn } from "@/lib/core/catalogue/tcgdex-browse";
import { withOwnArt, withOwnScans } from "@/lib/core/catalogue/image-store";
import { languageSetFromCopy } from "@/lib/core/catalogue/set-catalogue-mirror";
import { mirrorScans } from "@/lib/core/catalogue/mirror";
import { adminClient } from "@/lib/storage/supabase";
import { getCardPrices, getRows, tcgplayerPricesFor } from "@/lib/core/collection/collection";
import { pagePrintings } from "@/lib/core/catalogue/page-printings";
import {
  type HeadlineChange,
  headlineChanges,
  readFromDay,
  editionOfSeries,
} from "@/lib/core/collection/headline-printing";
import { priceLanguageOf } from "@/lib/core/price-months.mjs";
import { markOwnership, ownershipIndex } from "@/lib/core/collection/ownership";
import { galleriesByParent } from "@/lib/core/catalogue/set-galleries";
import { englishSetOfDay, englishShelfSets } from "@/lib/core/catalogue/catalogue";
import { authoriseOpen, openReadHeaders, readHeaders, refused } from "@/lib/api/guard";
import type { CatalogueMatch } from "@/lib/core/catalogue/ptcg-search";
import { bearer } from "@/lib/api/viewer";
import { elapsed, logTiming, timed } from "@/lib/core/timing";

/**
 * One set, all of it, with the viewer's own cards marked.
 *
 * Marked only where there is a viewer. A request that carries no credential is answered with the
 * set, its cards and their prices, and with no field saying what anybody holds: the catalogue is
 * nobody's secret, so Browse can be read before signing in.
 *
 * Paged in memory rather than at the source, and that is deliberate: the set
 * is read whole once and kept for a day (it is the same for everybody), so
 * slicing here costs nothing and buys two things a forwarded
 * page could not give: an exact `totalCount`, and an ownership mark that is
 * right for every card rather than for the twenty that happened to come back.
 *
 * The default page is 60 because that is roughly three screens of a grid. The
 * ceiling is 500, past any set with its gallery, so a client that wants the
 * whole set asks for pageSize=500 and gets it in one request. It was 250 until
 * 2026-09-14, and a Scarlet & Violet set then took two requests, each reading
 * the whole set again.
 *
 * Each card's `price` is its headline printing's, the one its sheet opens on, and `printing` names
 * it (headline-printing.ts). `from=yyyy-mm-dd` adds `priceChange`, what that printing did since
 * then: one read of the page's lines, only when asked, so a page that does not ask costs what it
 * always did.
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
  /* Nobody is allowed through this door. The set, its cards and their prices are the catalogue,
     the same page for every reader, so a visitor who has not signed in is shown it rather than a
     lock. A credential that is offered still has to verify; what it buys is the marks below. */
  const who = await authoriseOpen(req);
  if (who && refused(who)) {
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });
  }
  /* An answer with nobody's holdings in it is the same for everybody and worth a shared cache;
     one with them in it is that reader's alone and is held nowhere (guard.ts). */
  const headers = who ? readHeaders(req) : openReadHeaders(req);

  const { setId } = await params;
  const url = new URL(req.url);
  const page = intParam(url.searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
  const pageSize = intParam(url.searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  const language = url.searchParams.get("language");
  if (language && language !== "en" && !isBrowseLanguage(language))
    return apiError(400, "language must be en or ja.", undefined, {
      headers: readHeaders(req),
    });

  /* The window's first day, checked as `GET /v1/cards` checks its own: a day, and here also no
     later than today and no earlier than a year back, the longest period a set page offers. */
  const today = new Date().toISOString().slice(0, 10);
  const fromRaw = url.searchParams.get("from");
  const fromDay = fromRaw === null ? null : readFromDay(fromRaw, today);
  if (fromDay && "error" in fromDay)
    return apiError(400, fromDay.error, undefined, { headers: readHeaders(req) });
  const from = fromDay?.from ?? null;

  /* The viewer's rows do not wait on the catalogue: both are read at once. getRows never throws,
     it says `failed`, so a set that turns out not to exist leaves nothing unhandled. Nobody
     asking means nothing to read, and the collection is not touched at all. */
  const rowsRead = who ? getRows(who.userId, bearer(req) ?? undefined) : null;

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

  const mine = rowsRead ? await timed("set rows", () => rowsRead) : null;
  /* Keyed by the catalogue being shown. A row of that language carrying that catalogue's card
     id marks its own shelf exactly, by id; every other row marks the English one. Both
     directions matter, because a Japanese set named like an English one (Black Bolt) would
     otherwise be counted by the English cards, and was. */
  const held = mine
    ? markOwnership(
        ownershipIndex(
          mine.rows,
          isBrowseLanguage(language) ? language : null,
          isBrowseLanguage(language) ? [] : await englishShelfSets(),
        ),
        cards,
      )
    : null;
  /* The catalogue's own cards where there is nobody to mark them for: the same list, without the
     marks, rather than a list of marks that all say no. */
  const marked: CatalogueMatch[] = held ?? cards;
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
  const shelf = isBrowseLanguage(language) ? language : null;
  /* The printings each card's sheet lists, read beside the prices: a tile's figure is the first of
     them TCGplayer prices, the one the sheet opens on (headline-printing.ts). */
  const printingsRead = pagePrintings(
    onPage.map((c) => ({ key: priceKey(c), sheet: c.sheet })),
    shelf,
  );
  const [scans, prices] = await timed("set scans and prices", () =>
    Promise.all([scansRead, tcgplayerPricesFor(onPage.map(priceKey), shelf, printingsRead)]),
  );
  /* What each tile's printing did since `from`, out of the lines the chart draws: one read for the
     page's priced cards (getCardPrices, cached an hour as the card lists' is), each card's first
     and last reading of its own printing. A line that cannot be read is null on every card and
     says so, rather than failing a page that has everything else. */
  let changes: Map<string, HeadlineChange> | null = null;
  let changesFailed = false;
  if (from) {
    const priceLanguage = priceLanguageOf(shelf ?? "en");
    const priced = onPage.flatMap((c) => {
      const series = prices.get(priceKey(c))?.series;
      return series ? [{ id: c.id, tcgId: priceKey(c), language: priceLanguage, series }] : [];
    });
    const wanted = priced.map(({ tcgId, language }) => ({ tcgId, language }));
    const lines = await timed(
      "set price changes",
      () =>
        who
          ? getCardPrices(who.userId, wanted, bearer(req) ?? undefined, from)
          : /* The lines are card_price_months, the catalogue's and the same for everybody: the
               userId is the cache key and the tag a write drops, never a filter, so a reader who
               offered nothing shares one entry under a name no account can be given. And "nobody"
               is said rather than inferred: `anon` may not read the table, so this reader reads
               through the service role inside this metered route (getCardPrices says why). Read
               as `anon`, every visitor's page said priceChangesUnavailable from #584 on. */
            getCardPrices("catalogue", wanted, undefined, from, "nobody"),
      `${priced.length} cards`,
    );
    changesFailed = lines.failed;
    changes = headlineChanges(priced, lines.points, from, today);
  }
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
          /* The number as the card prints it, for its label. `number` stays the catalogue's, which
             ownership and a new row match by; they differ on a Classic Collection card only, which
             prints its original card's number (classicNumberOf). */
          printedNumber: classicNumberOf(c.tcgId) ?? c.number,
          /* Priced for everybody, signed in or not (Bart, 2026-09-22): what a card sells for is a
             fact about the card, out of TCGplayer's own market, and not a thing about the reader.
             What the reader holds of it is, and that is what goes missing above. */
          price: prices.get(priceKey(c))?.price ?? null,
          /* The printing that price is, keyed as the sheet's buttons are ("reverse-holo",
             "holo/cosmos"); null where the card has no price. */
          printing: prices.get(priceKey(c))?.printing ?? null,
          /* The print run that price is, for a card sold in runs ("unlimited", "1st-edition"): the
             choice such a card's sheet offers, so the tile names it rather than the finish. Null for
             a card sold in one run. */
          edition: editionOfSeries(prices.get(priceKey(c))?.series),
          ...(changes ? { priceChange: changes.get(c.id) ?? null } : {}),
        }),
      ),
      page,
      pageSize,
      totalCount: marked.length,
      /* Over the whole set, not over the page: the count a header wants to
         show is "12 of 207", and a page of 60 cannot answer it. Absent rather than zero where
         nobody asked, because "none of them" and "nobody asked" are different answers and a
         client that cannot tell them apart shows a stranger an empty collection. */
      ...(held ? { ownedCount: held.filter((c) => c.owned).length } : {}),
      hasMore: start + pageSize < marked.length,
      ...(mine?.failed ? { collectionUnavailable: true } : {}),
      ...(changesFailed ? { priceChangesUnavailable: true } : {}),
    },
    { headers },
  );
}
