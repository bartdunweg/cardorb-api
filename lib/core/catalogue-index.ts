/**
 * The cross-set half of the catalogue: every card, from every set, searchable
 * by name or number without knowing which set it came from first.
 *
 * catalogue.ts answers "everything about one named set", cached per set and
 * resolved on demand — the right shape for a page that already knows its set.
 * It is deliberately not the right shape for a search box, because answering
 * "cards named Charizard" from it would mean walking every set live, on every
 * keystroke (see docs/decisions/0008, and the cost this file exists to avoid
 * paying twice: catalogue.ts's own note that a full set walk is expensive
 * enough to cache, and tcgdex-client.ts's note that ~60 TCGdex requests in a
 * minute start getting refused).
 *
 * So this file pays that cost once, off the request path, and leaves a
 * queryable copy behind in public.catalogue_cards. refreshCatalogueIndex()
 * is the write side, run by the catalogue-refresh cron; searchCatalogue() is
 * the read side, used by the catalog/search route's no-set path.
 */

import { adminClient, readClient } from "../storage/supabase";
import { json, fetchSet } from "./tcgdex-client";
import type { TcgSet, TcgSetDetail } from "./tcgdex-client";
import { mapLimit } from "./util";

export type CatalogueIndexCard = {
  id: string;
  number: string;
  name: string;
  setName: string;
  image: string | null;
  imageHigh: string | null;
};

type Row = {
  id: string;
  local_id: string;
  name: string;
  set_id: string;
  set_name: string;
  image: string | null;
  asset_base: string | null;
  set_has_scans: boolean;
  updated_at: string;
};

/** Same probe loadSetCatalogue() uses: one HEAD decides a whole set's scans. */
async function setHasScans(detail: TcgSetDetail): Promise<boolean> {
  const probe = detail.cards?.find((c) => c.image)?.image;
  if (!probe) return true;
  try {
    const res = await fetch(`${probe}/low.webp`, { method: "HEAD" });
    return res.ok;
  } catch {
    return true;
  }
}

function rowsFor(detail: TcgSetDetail, stampedAt: string): Row[] {
  const assetBase = detail.logo?.replace(/\/logo$/, "") ?? null;
  const setName = detail.name ?? detail.id;
  return (detail.cards ?? [])
    .filter((c) => c.localId)
    .map((c) => ({
      id: c.id,
      local_id: c.localId ?? "",
      name: c.name ?? "",
      set_id: detail.id,
      set_name: setName,
      image: c.image ?? null,
      asset_base: assetBase,
      set_has_scans: true, // patched in below, once per set rather than per card
      updated_at: stampedAt,
    }));
}

/**
 * Walks every TCGdex set and replaces public.catalogue_cards with what it
 * found.
 *
 * Sequential on purpose, same as loadSetCatalogue()'s subset walk and for the
 * same reason: TCGdex starts refusing requests well before the ~48 sets this
 * has to fetch would fit in a minute run at once. There is no latency budget
 * to protect here — this runs off a weekly cron, not a request — so there is
 * nothing to trade that safety margin for.
 */
export async function refreshCatalogueIndex(): Promise<{ sets: number; cards: number }> {
  const db = adminClient();
  if (!db) throw new Error("No database configured: refreshCatalogueIndex needs adminClient().");

  // Stamped once, before the walk starts, so every row this run touches gets
  // the same updated_at. That is what lets the prune below find "everything
  // this run did not just write" with one lt() filter instead of an IN list
  // tens of thousands of ids long, which is well past what a PostgREST query
  // string can carry.
  const startedAt = new Date().toISOString();

  const sets = (await json("https://api.tcgdex.net/v2/en/sets", "sets index")) as TcgSet[];
  const details = (await mapLimit(sets.map((s) => s.id), 1, fetchSet)).filter(Boolean) as TcgSetDetail[];

  const rows: Row[] = [];
  for (const detail of details) {
    const hasScans = await setHasScans(detail);
    for (const row of rowsFor(detail, startedAt)) rows.push({ ...row, set_has_scans: hasScans });
  }

  // Upserted in batches rather than one call: Postgres/PostgREST have a
  // practical row limit per statement, and the whole catalogue is tens of
  // thousands of cards.
  const BATCH = 1000;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.from("catalogue_cards").upsert(rows.slice(i, i + BATCH));
    if (error) throw new Error(`catalogue_cards upsert failed: ${error.message}`);
  }

  // Cards that no longer exist in this walk (a card or set renamed or
  // removed) should not leave stale rows behind — anything with an older
  // updated_at than this run wasn't seen this time.
  if (rows.length) {
    const { error } = await db.from("catalogue_cards").delete().lt("updated_at", startedAt);
    if (error) throw new Error(`catalogue_cards prune failed: ${error.message}`);
  }

  return { sets: details.length, cards: rows.length };
}

/**
 * Cards whose name or number contains `query`, across every set, newest read
 * from public.catalogue_cards rather than TCGdex — the whole reason this file
 * exists. Optionally narrowed to one set, though the catalog/search route
 * only calls this for its no-set path; the set-scoped path stays on
 * setCatalogue(), which is fresher (a day old at most, not a week).
 *
 * readClient() rather than adminClient(): this runs inside the public,
 * no-key search route, and catalogue_cards' own RLS policy already allows
 * anyone to select it. Reusing the anon client here keeps that policy the
 * one place this permission is decided, rather than a second, silent grant
 * from bypassing RLS entirely.
 */
export async function searchCatalogue(
  query: string,
  opts: { set?: string; limit?: number } = {},
): Promise<CatalogueIndexCard[]> {
  const db = readClient();
  if (!db) return [];

  const limit = opts.limit ?? 60;
  // PostgREST's or() filter is a comma-separated list of column.op.value
  // terms, so a query containing a comma or parenthesis would otherwise be
  // read as filter syntax rather than as text to match.
  const escaped = query.toLowerCase().replace(/[,()]/g, "");
  const like = `%${escaped}%`;
  let q = db
    .from("catalogue_cards")
    .select("id, local_id, name, set_name, image, asset_base, set_has_scans")
    .or(`name.ilike.${like},local_id.ilike.${like}`)
    .limit(limit);
  if (opts.set) q = q.eq("set_name", opts.set);

  const { data, error } = await q;
  if (error) throw new Error(`catalogue_cards search failed: ${error.message}`);

  return (data ?? []).map((c) => {
    const tcgBase = !c.set_has_scans
      ? null
      : (c.image ?? (c.local_id && c.asset_base ? `${c.asset_base}/${c.local_id}` : null));
    return {
      id: c.id,
      number: c.local_id,
      name: c.name,
      setName: c.set_name,
      image: tcgBase ? `${tcgBase}/low.webp` : null,
      imageHigh: tcgBase ? `${tcgBase}/high.webp` : null,
    };
  });
}
