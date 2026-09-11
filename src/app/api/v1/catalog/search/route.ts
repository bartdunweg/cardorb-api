import { NextResponse } from "next/server";
import { apiError, refuse } from "@/lib/api/respond";
import { englishSets } from "@/lib/core/catalogue/tcgdex-browse";
import { searchCards } from "@/lib/core/catalogue/tcgdex-search";
import { getRows } from "@/lib/core/collection/collection";
import { markOwnership, ownershipIndex } from "@/lib/core/collection/ownership";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";

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
  const filters = {
    name: url.searchParams.get("name")?.trim() ?? "",
    number: url.searchParams.get("number")?.trim() ?? "",
    set: url.searchParams.get("set")?.trim() ?? "",
    type: url.searchParams.get("type")?.trim() ?? "",
  };
  const usingFilters = Object.values(filters).some(Boolean);
  const pageParam = Number(url.searchParams.get("page"));
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  if (!usingFilters) {
    const query = (url.searchParams.get("query") ?? "").trim();
    if (query.length < 2) {
      return apiError(400, "Type at least two characters to search.", undefined, {
        headers: readHeaders(req),
      });
    }
  }

  try {
    const { cards, total } = usingFilters
      ? await searchCards(filters, page)
      : await searchCards((url.searchParams.get("query") ?? "").trim(), page);
    /* After the search, not before: a search that is about to 502 should not
       have cost a collection read. getRows() fails soft, so a store outage
       leaves every result unmarked rather than taking the search down with it. */
    const { rows } = await getRows(who.userId, bearer(req) ?? undefined);
    // The English sets, for the join to file each row under the set it resolves to; the
    // search has just read the same index, so this is the memoised promise, not a request.
    const sets = await englishSets().catch(() => []);
    return NextResponse.json(
      /* `total` is how many the whole search matched, at most the window it reads (250,
         which then means "at least"); a client shows it above the page. */
      { cards: markOwnership(ownershipIndex(rows, null, sets), cards), total },
      { headers: readHeaders(req) },
    );
  } catch {
    return refuse("catalogue", { headers: readHeaders(req) });
  }
}
