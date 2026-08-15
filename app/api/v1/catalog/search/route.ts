import { NextResponse } from "next/server";
import { searchCards } from "../../../../../lib/core/ptcg-search";
import { authorise, readHeaders, refused } from "../../../../../lib/api/guard";

/**
 * Finding a card to add, by anything: name, number, set, or type, in one box
 * — or, precisely, by any combination of those four as separate filters.
 *
 * Used to be scoped to one set at a time (see git history / ADR-0030), on the
 * reasoning that a global search meant fetching every TCGdex set uncached per
 * keystroke. That reasoning was sound and the UX it produced was wrong —
 * "als je op plus klikt... 1 invoerveld voor alles" (see
 * docs/feedback/0005-add-card-should-be-one-search-bar.md) — so this asks
 * pokemontcg.io instead, which already indexes every card across every set
 * behind one query. See lib/core/ptcg-search.ts for the query shape and why
 * it lives apart from ptcg.ts's narrower artwork-fallback job.
 *
 * `name`/`number`/`set`/`type` are a second, separate mode from `query`
 * (advanced filters rather than the quick search box) — see
 * docs/feedback/0006-add-card-no-manual-entry-escape-hatch.md for why the
 * alternative to the quick box is a more precise search rather than a way to
 * skip search and add an unmatched row.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const who = await authorise(req);
  if (refused(who)) {
    return NextResponse.json({ error: who.error }, { status: who.status, headers: readHeaders(req) });
  }

  const url = new URL(req.url);
  const filters = {
    name: url.searchParams.get("name")?.trim() ?? "",
    number: url.searchParams.get("number")?.trim() ?? "",
    set: url.searchParams.get("set")?.trim() ?? "",
    type: url.searchParams.get("type")?.trim() ?? "",
  };
  const usingFilters = Object.values(filters).some(Boolean);

  if (usingFilters) {
    const cards = await searchCards(filters);
    return NextResponse.json({ cards }, { headers: readHeaders(req) });
  }

  const query = (url.searchParams.get("query") ?? "").trim();
  if (query.length < 2) {
    return NextResponse.json(
      { error: "Type at least two characters to search." },
      { status: 400, headers: readHeaders(req) },
    );
  }

  const cards = await searchCards(query);
  return NextResponse.json({ cards }, { headers: readHeaders(req) });
}
