import { NextResponse } from "next/server";
import { setCatalogue } from "../../../../../lib/core/catalogue";
import { searchCatalogue } from "../../../../../lib/core/catalogue-index";
import { localise } from "../../../../../lib/core/util";
import { authorise, readHeaders, refused } from "../../../../../lib/api/guard";

/**
 * Finding a card to add, by name or number, inside one set or across all of
 * them.
 *
 * Two paths, because they pay for freshness differently. With `set`, this
 * still calls setCatalogue() directly — a day-old cache at most, cheap to
 * keep that fresh because resolving and walking one set is a query, not a
 * texture on the app's expensive corner. Without `set`, it reads
 * public.catalogue_cards instead (lib/core/catalogue-index.ts), a table
 * populated by the weekly catalogue-refresh cron rather than fetched here —
 * going from a typed name to candidates across every set live would mean
 * fetching every set from TCGdex per keystroke, which is exactly the cost
 * decision 0008 (docs/decisions/0008-per-variant-inventory-fields-and-bearer-rls-fix.md,
 * "What this does not do") ruled out doing on the request path. That
 * reasoning still holds for why cross-set results are up to a week old
 * instead of a day; it no longer rules out cross-set search existing at all.
 *
 * The image/imageHigh construction below is the same one buildCollection()
 * uses for a matched row (lib/core/cards.ts) — a card found here and a card
 * already in the collection resolve to the identical URL, because they are
 * the identical printing.
 */
export const dynamic = "force-dynamic";

const MAX_RESULTS = 60;
// 3, not 2: pg_trgm indexes 3-character trigrams, so a shorter query gets
// little benefit from catalogue_cards' GIN index and degrades toward a full
// scan of a table with no per-set boundary to shrink it first.
const MIN_QUERY_LENGTH = 3;

export async function GET(req: Request) {
  const who = await authorise(req);
  if (refused(who)) {
    return NextResponse.json({ error: who.error }, { status: who.status, headers: readHeaders(req) });
  }

  const url = new URL(req.url);
  const set = url.searchParams.get("set")?.trim() ?? "";
  const query = url.searchParams.get("query")?.trim().toLowerCase() ?? "";

  if (!set) {
    if (query.length < MIN_QUERY_LENGTH) {
      return NextResponse.json(
        { error: `Search needs at least ${MIN_QUERY_LENGTH} characters without a set to look in.` },
        { status: 400, headers: readHeaders(req) },
      );
    }
    const cards = await searchCatalogue(query, { limit: MAX_RESULTS });
    return NextResponse.json({ cards }, { headers: readHeaders(req) });
  }

  const cat = await setCatalogue(set);

  // byNumber holds every form of a localId ("77", "077", "77a") pointing at
  // the same card, so this dedupes on id before it counts toward the limit —
  // otherwise one popular card in a small set could be the whole page.
  const seen = new Set<string>();
  const cards = Object.values(cat.byNumber)
    .filter((c) => {
      if (seen.has(c.id)) return false;
      if (query && !c.name.toLowerCase().includes(query) && !c.localId.toLowerCase().includes(query)) {
        return false;
      }
      seen.add(c.id);
      return true;
    })
    .slice(0, MAX_RESULTS)
    .map((c) => {
      const tcgBase = !cat.setHasScans
        ? null
        : (c.image ?? (c.localId && cat.assetBase ? `${cat.assetBase}/${c.localId}` : null));
      return {
        id: c.id,
        number: c.localId,
        name: c.name,
        setName: set,
        image: tcgBase ? localise(`${tcgBase}/low.webp`) : null,
        imageHigh: tcgBase ? localise(`${tcgBase}/high.webp`) : null,
      };
    });

  return NextResponse.json({ cards }, { headers: readHeaders(req) });
}
