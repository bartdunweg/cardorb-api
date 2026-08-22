/**
 * The catalogue as something to walk through, rather than something to search.
 *
 * Everything Card Orb showed until now was a card somebody already owns. This
 * answers the other question — what is *in* Scarlet & Violet 151, all 207 of
 * them, whether or not any of them are in the binder — which is the question a
 * collector asks before they own the set rather than after.
 *
 * ── Why pokemontcg.io and not TCGdex ───────────────────────────────────────
 *
 * TCGdex is the source of truth for the assembled collection and stays that
 * way. It is the wrong source for this one, for a reason already written
 * down: its list endpoint carries no rarity and no types, only its single-card
 * endpoint does, so browsing a 207-card set from TCGdex is 207 extra requests
 * to show what a grid displays at a glance. pokemontcg.io returns rarity, types
 * and both image sizes in the same list call, and it is already the source the
 * add-card dialog searches — so a card found by browsing and the same card found
 * by typing carry the same id, and "add this one" is the flow that already
 * exists rather than a second one.
 *
 * ── Why this is a file and not two functions in ptcg-search.ts ──────────────
 *
 * Same host, different contract, the same seam ptcg-search.ts drew against
 * ptcg.ts. Search is per-keystroke, cached for five minutes, and asks a question
 * whose answer changes with every letter. This is per-set, cached for a day,
 * and asks a question whose answer changes when a set is printed. Sharing a
 * file would mean sharing a cache lifetime, and one of the two would be wrong.
 *
 * ── On the same path names that were deleted once ──────────────────────────
 *
 * A previous session built /api/v1/catalog/sets off TCGdex as a set-picker for
 * the add-card dialog, and it was deleted when the one-box search replaced that
 * flow. This is not that returning: nothing here feeds the
 * add form's identity fields, and the reason it was redundant — a set picker in
 * front of a search that does not need one — does not apply to a screen whose
 * entire purpose is the set. See the decision record for the long version.
 */

import { DAY } from "../util";
import { escapeTerm, type CatalogueMatch } from "./ptcg-search";

/** One set, with enough to render a tile and sort a shelf. */
export type CatalogueSet = {
  id: string;
  name: string;
  series: string;
  /** As pokemontcg.io writes it, "YYYY/MM/DD" — sortable as a string. */
  releaseDate: string | null;
  /** Every card in the set, secret rares included. */
  total: number;
  /** The number printed on the cards ("165" of a set that actually holds 207). */
  printedTotal: number | null;
  logo: string | null;
  symbol: string | null;
};

type PtcgSetJson = {
  id: string;
  name?: string;
  series?: string;
  releaseDate?: string;
  total?: number;
  printedTotal?: number;
  images?: { logo?: string; symbol?: string };
};

type PtcgCardJson = {
  id: string;
  number?: string;
  name?: string;
  rarity?: string;
  types?: string[];
  set?: { name?: string; series?: string };
  images?: { small?: string; large?: string };
};

const HOST = "https://api.pokemontcg.io/v2";

const headers = (): Record<string, string> =>
  process.env.POKEMONTCG_API_KEY ? { "X-Api-Key": process.env.POKEMONTCG_API_KEY } : {};

/**
 * One GET, retried, cached for a day.
 *
 * A day rather than search's five minutes because the answers here are not
 * about what somebody is typing: a set's contents change when a set is printed.
 * That matters more than it sounds — this host answers 500 and 502 often enough
 * that both ptcg.ts and ptcg-search.ts carry a note about it, and browsing a set
 * is several requests where searching is one.
 *
 * Throws once the attempts are gone, rather than returning an empty page. The
 * whole point is that a catalogue that refused and a set that is
 * genuinely empty must not arrive at the caller looking alike; a browse screen
 * showing "no cards in this set" because a host hiccuped is exactly that bug
 * with a bigger surface.
 */
async function get<T>(url: string, label: string): Promise<T> {
  const ATTEMPTS = 3;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers: headers(), next: { revalidate: DAY } });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as T;
    } catch (err) {
      if (attempt < ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        continue;
      }
      console.error(`pokemontcg.io ${label} unavailable:`, err);
      throw new Error(`pokemontcg.io ${label} unavailable`, { cause: err });
    }
  }
  /* Unreachable — the loop returns or throws — but the `for` shape does not tell
     TypeScript that, the same way ptcg-search.ts's does not. */
  throw new Error(`pokemontcg.io ${label} unavailable`);
}

/**
 * Every set they list, newest first.
 *
 * 174 sets in one request, which is why this does not page: their maximum page
 * size is 250 and the whole catalogue fits inside it with room for the next
 * decade of releases. Should that stop being true the count check below is what
 * will say so, rather than a screen quietly missing its newest shelf.
 *
 * Newest first because that is the order every other set list in the app uses
 * (buildCollection sorts CardSet[] the same way), and a collector opening a
 * browse screen is looking for the set that just came out far more often than
 * for Base.
 */
export async function listSets(): Promise<CatalogueSet[]> {
  const url =
    `${HOST}/sets?select=id,name,series,releaseDate,total,printedTotal,images` + `&pageSize=250`;
  const body = await get<{ data?: PtcgSetJson[]; totalCount?: number }>(url, "set list");
  const data = body.data ?? [];
  if (body.totalCount && data.length < body.totalCount) {
    /* Not an error — a partial shelf is still a usable screen — but the day this
       fires is the day this function needs the paging loop setCards() has. */
    console.warn(`pokemontcg.io lists ${body.totalCount} sets, one page returned ${data.length}`);
  }
  return data
    .filter((s): s is PtcgSetJson & { name: string } => !!s.name)
    .map((s) => ({
      id: s.id,
      name: s.name,
      series: s.series ?? "Other",
      releaseDate: s.releaseDate ?? null,
      total: s.total ?? 0,
      printedTotal: s.printedTotal ?? null,
      logo: s.images?.logo ?? null,
      symbol: s.images?.symbol ?? null,
    }))
    .sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
}

/** One set by id, or null where nothing carries that id. */
export async function findSet(setId: string): Promise<CatalogueSet | null> {
  return (await listSets()).find((s) => s.id === setId) ?? null;
}

/**
 * The number a card is filed under, split so it can be ordered the way a binder
 * page is rather than the way a string sort is.
 *
 * `orderBy=number` on their side is lexical, which puts 10 before 2 and buries
 * card 100 among the singles. And a set's numbers are not all numbers: 151 runs
 * 1–207, Silver Tempest's gallery runs TG01–TG30, and the promos run SVP001.
 * So the prefix decides the group — the plain run first, then each lettered run
 * in alphabetical order — and the digits decide the place within it.
 */
function numberOrder(number: string): [string, number, string] {
  const m = /^([A-Za-z]*)0*(\d+)(.*)$/.exec(number.trim());
  if (!m) return [number.toUpperCase(), Number.MAX_SAFE_INTEGER, number];
  return [(m[1] ?? "").toUpperCase(), Number(m[2]), m[3] ?? ""];
}

/** Their maximum, and the reason a set is usually one request. */
const PAGE_SIZE = 250;

/**
 * How many pages this will ever ask for. The biggest set they list is a few
 * hundred cards, so four is slack rather than a limit anyone reaches — it is
 * here so a malformed id or a host answering the same page forever costs four
 * requests instead of every request there is.
 */
const MAX_PAGES = 4;

/**
 * Every card in one set, in binder order.
 *
 * The whole set rather than a page of it, because the caller wants two things a
 * page cannot give: an exact total, and an exact count of how many of them are
 * owned. Both are cheap once — one request for most sets, cached for a day and
 * shared by everybody, since which cards are in a set is nobody's private fact —
 * and expensive to approximate. The API route pages this in memory instead.
 *
 * Returns `[]` for a set that exists and has nothing, and throws when the host
 * refused; get() above is where that distinction is kept honest.
 */
export async function setCards(setId: string): Promise<CatalogueMatch[]> {
  const q = encodeURIComponent(`set.id:${escapeTerm(setId)}`);
  const cards: CatalogueMatch[] = [];
  let expected = Infinity;

  for (let page = 1; page <= MAX_PAGES && cards.length < expected; page++) {
    const url =
      `${HOST}/cards?q=${q}&page=${page}&pageSize=${PAGE_SIZE}` +
      `&select=id,number,name,rarity,types,set,images`;
    const body = await get<{ data?: PtcgCardJson[]; totalCount?: number }>(url, `set ${setId}`);
    expected = body.totalCount ?? 0;
    const batch = body.data ?? [];
    if (!batch.length) break;
    for (const c of batch) {
      if (!c.number || !c.name) continue;
      cards.push({
        id: c.id,
        number: c.number,
        name: c.name,
        setName: c.set?.name ?? "",
        series: c.set?.series ?? null,
        image: c.images?.small ?? null,
        imageHigh: c.images?.large ?? null,
        rarity: c.rarity ?? null,
        types: c.types ?? [],
      });
    }
  }

  return cards.sort((a, b) => {
    const [ap, an, ar] = numberOrder(a.number);
    const [bp, bn, br] = numberOrder(b.number);
    return ap.localeCompare(bp) || an - bn || ar.localeCompare(br);
  });
}
