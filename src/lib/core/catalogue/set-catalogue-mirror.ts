/**
 * A set as the copy in Postgres has it, in the shape the collection already reads.
 *
 * The copy has held the catalogue's cards since #326, and the search has read it since: a query
 * instead of two requests per keystroke. The collection never did. Every read of somebody's
 * cards still resolved its sets over HTTP against the very catalogue the copy was made from:
 * the set index, a request per set, a HEAD to ask whether the set has artwork at all, and a
 * fallback chain for what was left. That is what put TCGdex between a person and their own
 * collection, and on 2026-09-12 it is what emptied every tile of set 151 for a day.
 *
 * So the collection reads the copy too. Same matcher, same shape, one query. TCGdex stays as the
 * way in for a set the nightly run has not been through yet, which is a set published today; see
 * loadSetCatalogue(), which asks here first and falls through when the answer is null.
 *
 * Three things the live path does that this one does not have to:
 *
 * - **The HEAD probe.** The copy stores the picture it checked when it copied the set
 *   (withResolvedScans in mirror.ts), so a card with no scan has no scan written down, and there
 *   is nothing to find out per read.
 * - **The per-card fallbacks.** Same reason: Limitless and pokemontcg.io were asked at copy
 *   time, for the whole set, once.
 * - **Guessing an address from the set's logo.** A gallery card is in the copy with its own
 *   picture, so there is nothing left to build by hand.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type CatalogueSetRecord,
  catalogueCardsBySets,
  listCatalogueSets,
} from "@/lib/storage/postgres";
import type { Price } from "../price-basis.mjs";
import { indexByNumber } from "./set-index";
import { resolveSetIds } from "./set-resolve";
import type { SetCatalogue } from "./catalogue";
import { setArt } from "./set-art";
import { pricesFor } from "./tcgdex-client";

/**
 * The copy's sets, read whole and kept for ten minutes.
 *
 * A few hundred rows, and every set name resolved wants all of them, so reading them per set
 * would be one query per set where one answers for the lot. Ten minutes because the copy is
 * written once a night: the cost of being ten minutes behind it is nothing, and the run that
 * copies a brand new set is noticed within the same ten.
 */
let sets: { at: number; rows: CatalogueSetRecord[] } | null = null;
const SETS_FOR_MS = 600_000;

async function copiedSets(db: SupabaseClient): Promise<CatalogueSetRecord[]> {
  if (sets && Date.now() - sets.at < SETS_FOR_MS) return sets.rows;
  const rows = await listCatalogueSets(db);
  sets = { at: Date.now(), rows };
  return rows;
}

/** For the tests, and for the one place that needs the next read to go to the database. */
export function forgetCopiedSets(): void {
  sets = null;
}

/** How big a set may be before pre-pricing it stops being a saving. Same rule as the live path. */
function pricingMax(): number {
  const raw = Number(process.env.CATALOGUE_SET_PRICING_MAX);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/**
 * The set this name means, out of the copy, or null where the copy cannot answer.
 *
 * Null is not a failure and is never cached as one: it means the nightly run has not reached
 * this set, and the caller asks TCGdex the way it always did. A set whose row is there and whose
 * cards are not is the same answer, because a set with no cards is not a set that can be matched
 * against, and quietly returning an empty index is exactly the bug this whole change is about.
 */
export async function mirrorSetCatalogue(setName: string): Promise<SetCatalogue | null> {
  // Imported here rather than at the top, and that is not a style choice: the client module is
  // marked `server-only`, and a static import of it would drag that guard into every test that
  // reaches a set catalogue by way of buildCollection. The loader caches the module, so this
  // costs one lookup and nothing after it.
  const { adminClient } = await import("@/lib/storage/supabase");
  const db = adminClient();
  if (!db) return null;
  const rows = await copiedSets(db);
  if (!rows.length) return null;

  // The same resolver the live path uses, over the copy's sets instead of TCGdex's index, so a
  // promo alias, a longest-overlap match and a gallery subset are decided by one rule.
  const ids = resolveSetIds(
    setName,
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      cardCount: { official: r.printed_total ?? undefined, total: r.total ?? undefined },
    })),
  );
  if (!ids.length) return null;

  const groups = await catalogueCardsBySets(db, ids);
  if (!groups.some((g) => g.length)) return null;
  const main = rows.find((r) => r.id === ids[0]) ?? null;

  const byNumber = indexByNumber(
    groups.map((cards) =>
      cards.map((c) => ({ id: c.id, localId: c.local_id, name: c.name, image: c.image })),
    ),
  );

  // Off by default, and kept only so turning it on keeps meaning what it means: a copied set
  // would otherwise silently stop pre-pricing while an uncopied one still did.
  const max = pricingMax();
  const total = main?.total ?? null;
  let prices: Record<string, Price> = {};
  if (max > 0 && total !== null && total <= max) {
    const cardIds = [...new Set(Object.values(byNumber).map((c) => c.id))];
    prices = Object.fromEntries(
      [...(await pricesFor(cardIds))].flatMap(([id, p]) =>
        p.price ? [[id, p.price] as const] : [],
      ),
    );
  }

  return {
    byNumber,
    // Nothing to guess an address from, and nothing that needs one: every card in the copy
    // carries the picture that was checked for it, or none at all.
    assetBase: null,
    officialName: main?.name ?? null,
    code: main?.abbreviation ?? null,
    // The copy only ever writes a picture it found. A set that has none simply has none, which
    // the per-card nulls already say, so there is no whole-set verdict to make here.
    setHasScans: true,
    logo: await setArt(setName, main?.logo ?? null, main?.symbol ?? null),
    releaseDate: main?.release_date ?? null,
    total,
    prices,
  };
}
