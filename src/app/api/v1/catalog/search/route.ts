import { NextResponse } from "next/server";
import { apiError, refuse } from "@/lib/api/respond";
import { englishSets, isBrowseLanguage } from "@/lib/core/catalogue/tcgdex-browse";
import { searchCards } from "@/lib/core/catalogue/tcgdex-search";
import { getRows, tcgplayerPricesFor } from "@/lib/core/collection/collection";
import { markOwnership, ownershipIndex } from "@/lib/core/collection/ownership";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";
import { timed } from "@/lib/core/timing";
import { adminClient } from "@/lib/storage/supabase";

/**
 * Finding a card to add, by anything: name, number, set, or type, in one box
 * — or, precisely, by any combination of those four as separate filters.
 *
 * Used to be scoped to one set at a time (see git history), on the
 * reasoning that a global search meant fetching every TCGdex set uncached per
 * keystroke. That reasoning was sound and the UX it produced was wrong —
 * "als je op plus klikt... 1 invoerveld voor alles" (see
 * git history) — so this asks one catalogue for every set at once. That was
 * pokemontcg.io until 2026-09-11 and is TCGdex since: see
 * lib/core/catalogue/tcgdex-search.ts for the query shape and for what the
 * other host had started answering.
 *
 * `name`/`number`/`set`/`type` are a second, separate mode from `query`
 * (advanced filters rather than the quick search box) — see
 * git history for why the
 * alternative to the quick box is a more precise search rather than a way to
 * skip search and add an unmatched row.
 *
 * `page` (default 1) is a page of MAX_RESULTS into the search's window, so
 * a broad query (a common name across a hundred printings) can be paged
 * through from the dialog's "Show more results" instead of capping out at
 * one page silently.
 *
 * A `searchCards()` failure answers 502, not the 400 used for "you typed
 * nothing useful" — the two are different problems for the dialog to show
 * differently (a request worth retrying vs. one that needs a different
 * query), and conflating them is exactly the bug that prompted this: see
 * git history.
 *
 * Every result now carries owned/wishlist/quantity for the caller, the same
 * fields /api/v1/catalog/sets/[setId] attaches — added with browse, because the
 * moment a search result is worth marking is the moment somebody is about to
 * add a second copy of a card they already have without meaning to. The shape
 * is additive: `{ cards }` is still `{ cards }`, and a client that ignores the
 * new fields is unaffected.
 *
 * And a price under every result, as the set page puts one under every card:
 * a hit used to be a name to pick and nothing more, and the web's search opens
 * the card's full sheet now, which says what the card trades at above its
 * price line. TCGplayer's, from the tcgcsv groups cached for the day, for the
 * reason tcgplayerPricesFor gives; a card TCGplayer does not price carries
 * null, as it does on the set page.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const who = await authorise(req);
  if (refused(who)) {
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });
  }

  const url = new URL(req.url);
  /* `?language=ja|zh-tw|zh-cn|ko`: that catalogue rather than the English one, as the set route
     reads it. Left out, English, which is every search this route had answered before. */
  const languageParam = url.searchParams.get("language");
  if (languageParam && languageParam !== "en" && !isBrowseLanguage(languageParam))
    return apiError(400, "language must be en, ja, zh-tw, zh-cn or ko.", undefined, {
      headers: readHeaders(req),
    });
  const language = isBrowseLanguage(languageParam) ? languageParam : null;
  const filters = {
    name: url.searchParams.get("name")?.trim() ?? "",
    number: url.searchParams.get("number")?.trim() ?? "",
    set: url.searchParams.get("set")?.trim() ?? "",
    type: url.searchParams.get("type")?.trim() ?? "",
  };
  /* `?fullArt=1`: only the cards whose illustration covers the whole card. Not a fifth filter
     field but a narrowing of whatever was asked, because it cuts across the rarities rather
     than being one of them, and because on its own it is a question worth asking: every full
     art in the catalogue, newest set first. Answered by the copy alone; see searchCards. */
  const fullArt = url.searchParams.get("fullArt") === "1";
  const usingFilters = Object.values(filters).some(Boolean);
  const pageParam = Number(url.searchParams.get("page"));
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  if (!usingFilters && !fullArt) {
    const query = (url.searchParams.get("query") ?? "").trim();
    if (query.length < 2) {
      return apiError(400, "Type at least two characters to search.", undefined, {
        headers: readHeaders(req),
      });
    }
  }

  try {
    /* The catalogue's copy (lib/core/catalogue/mirror.ts) is the service role's to read: no
       person's data is in it, and the search reads it before it asks TCGdex. */
    const store = adminClient();
    const term = (url.searchParams.get("query") ?? "").trim();
    /* Three reads, none waiting on another: the hits from the copy, the person's rows for the
       owned marks, and the English set index the join files those rows under. In a row they were 0.8 to 1.1 s on 2026-09-11 (measured from
       cardorb.com, the copy filled and the query itself 1 ms); every one is a hop to another
       region, and the sum is what the person waits for. Together they cost the slowest one.
       getRows() fails soft, so a store outage leaves every result unmarked rather than taking
       the search down with it; a search that fails still fails the request (502 below). */
    const [{ cards, total }, { rows }, sets] = await Promise.all([
      timed("catalogue search", () =>
        usingFilters
          ? searchCards(filters, page, language, store, { fullArt })
          : searchCards(term, page, language, store, { fullArt }),
      ),
      timed("collection rows", () => getRows(who.userId, bearer(req) ?? undefined)),
      language ? Promise.resolve([]) : timed("en set index", () => englishSets().catch(() => [])),
    ]);
    const marked = markOwnership(ownershipIndex(rows, language, sets), cards);
    /* Keyed by the TCGdex id, which every hit carries and which everything priced is keyed by;
       the fallback is the set route's, for a card that came without the one. */
    const priceKey = (c: (typeof marked)[number]) => c.tcgId ?? c.id;
    const prices = await timed("tcgplayer prices", () =>
      tcgplayerPricesFor(marked.map(priceKey), language),
    );
    return NextResponse.json(
      /* `total` is how many the whole search matched, at most the window it reads (250,
         which then means "at least"); a client shows it above the page. */
      {
        cards: marked.map((c) => ({
          ...c,
          price: prices.get(priceKey(c))?.price ?? null,
          priceHolo: prices.get(priceKey(c))?.holo ?? null,
        })),
        total,
      },
      { headers: readHeaders(req) },
    );
  } catch {
    return refuse("catalogue", { headers: readHeaders(req) });
  }
}
