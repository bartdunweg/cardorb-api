import { NextResponse } from "next/server";
import { setCatalogue } from "../../../../../lib/core/catalogue";
import { localise } from "../../../../../lib/core/util";
import { authorise, readHeaders, refused } from "../../../../../lib/api/guard";

/**
 * Finding a card to add, by name, inside one set.
 *
 * Scoped to a set on purpose, not a smaller version of a bigger feature still
 * to come. Nothing in this codebase can go from a typed name to candidate
 * cards across every set without fetching every set from TCGdex to find out —
 * setCatalogue() resolves one named set at a time, and that is the expensive
 * half this whole file (see catalogue.ts's own comment) exists to cache. A
 * global search would mean paying that cost, uncached, on every keystroke,
 * for a set of results no set-scoped search already gives the add-card form.
 * See docs/decisions/0006-per-variant-inventory-fields.md.
 *
 * The image/imageHigh construction below is the same one buildCollection()
 * uses for a matched row (lib/core/cards.ts) — a card found here and a card
 * already in the collection resolve to the identical URL, because they are
 * the identical printing.
 */
export const dynamic = "force-dynamic";

const MAX_RESULTS = 60;

export async function GET(req: Request) {
  const who = await authorise(req);
  if (refused(who)) {
    return NextResponse.json({ error: who.error }, { status: who.status, headers: readHeaders(req) });
  }

  const url = new URL(req.url);
  const set = url.searchParams.get("set")?.trim() ?? "";
  const query = url.searchParams.get("query")?.trim().toLowerCase() ?? "";

  if (!set) {
    return NextResponse.json(
      { error: "Search needs a set to look in." },
      { status: 400, headers: readHeaders(req) },
    );
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
