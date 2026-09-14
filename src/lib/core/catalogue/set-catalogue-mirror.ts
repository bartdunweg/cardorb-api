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
import { timed } from "../timing";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type CatalogueSetRecord,
  catalogueCardsBySets,
  type CatalogueLanguage,
  catalogueSetCards,
  listCatalogueSets,
  listCatalogueSync,
} from "@/lib/storage/postgres";
import { storedScan } from "./artwork";
import { localise } from "../util";
import {
  type BrowseLanguage,
  type CatalogueSet,
  byShelfOrder,
  inBinderOrder,
} from "./tcgdex-browse";
import PTCG_SET_IDS from "./ptcg-set-ids.json";
import type { CatalogueMatch } from "./ptcg-search";
import { indexByNumber } from "./set-index";
import { resolveSetIds } from "./set-resolve";
import type { SetCatalogue } from "./catalogue";

/**
 * The copy's full-art flag, where the row carries one. A row read without the column leaves the
 * field out, so a client never mistakes "not read" for "not full art".
 */
const copiedFullArt = (c: { full_art?: boolean | null }): { fullArt?: boolean } =>
  typeof c.full_art === "boolean" ? { fullArt: c.full_art } : {};

/**
 * The copy's sets, read whole and kept for ten minutes.
 *
 * A few hundred rows, and every set name resolved wants all of them, so reading them per set
 * would be one query per set where one answers for the lot. Ten minutes because the copy is
 * written once a night: the cost of being ten minutes behind it is nothing, and the run that
 * copies a brand new set is noticed within the same ten.
 */
const sets = new Map<CatalogueLanguage, { at: number; rows: CatalogueSetRecord[] }>();
const SETS_FOR_MS = 600_000;

async function copiedSets(
  db: SupabaseClient,
  language: CatalogueLanguage = "en",
): Promise<CatalogueSetRecord[]> {
  const kept = sets.get(language);
  if (kept && Date.now() - kept.at < SETS_FOR_MS) return kept.rows;
  const rows = await listCatalogueSets(db, language);
  sets.set(language, { at: Date.now(), rows });
  return rows;
}

/** For the tests, and for the one place that needs the next read to go to the database. */
export function forgetCopiedSets(): void {
  sets.clear();
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

  const total = main?.total ?? null;

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
    /* The copy's own art, resolved at night the way the shelf shows it (the promo star,
       pokemontcg.io's wordmark where TCGdex has none) and kept in our bucket. setArt() would ask
       pokemontcg.io again for a set with no logo, on a request. */
    logo: localise(main?.logo ?? main?.symbol ?? null),
    releaseDate: main?.release_date ?? null,
    total,
    fromCopy: true,
  };
}

/**
 * The copy's row for a set id as a page or a row names it: TCGdex's own id, pokemontcg.io's from
 * before 2026-09-11 (ptcg-set-ids.json), or either in another case. The same three rules as
 * resolveEnglishSetId(), over the copy's sets rather than TCGdex's index, so a set page on a cold
 * instance does not ask TCGdex for its index to find a row the copy already has.
 */
function copiedSetFor(rows: CatalogueSetRecord[], setId: string): CatalogueSetRecord | null {
  const exact = rows.find((r) => r.id === setId);
  if (exact) return exact;
  const lower = setId.toLowerCase();
  const mapped = (PTCG_SET_IDS as Record<string, string>)[lower];
  return (
    rows.find((r) => r.id === mapped) ?? rows.find((r) => r.id.toLowerCase() === lower) ?? null
  );
}

/**
 * English sets whose every card is a card of another set: TCGdex's Yellow A Alternate is six "a"
 * printings from xy3, xy4, xy6, xy9, xy10 and g1, already on those sets' pages (2026-09-14).
 */
const DUPLICATE_SETS: ReadonlySet<string> = new Set(["xya"]);

/**
 * Every English set out of the copy, newest first, the shape englishSets() answers and with the
 * logo a tile shows (the nightly run stores it resolved: the promo star, pokemontcg.io's wordmark
 * where TCGdex has none). Null where the copy holds no set or cannot be read, and the caller asks
 * TCGdex as before.
 *
 * Bart, 2026-09-14: everything is read from our own copy; the catalogues are asked only at night,
 * for what is new. The shelf asked TCGdex's GraphQL index and then pokemontcg.io for 57 logos on
 * every cold instance: 289 ms and 339 ms measured, and 5 s a logo when pokemontcg.io refuses.
 * Compared that day with englishSets() and withSetLogos(): all 203 sets the same in id, name,
 * series, date, counts and symbol; the logos once the 36 resolved ones were stored.
 */
export async function copiedEnglishSets(): Promise<CatalogueSet[] | null> {
  const { adminClient } = await import("@/lib/storage/supabase");
  const db = adminClient();
  if (!db) return null;
  const [rows, sync] = await Promise.all([
    copiedSets(db).catch(() => [] as CatalogueSetRecord[]),
    listCatalogueSync(db).catch(() => []),
  ]);
  if (!rows.length) return null;
  /* A set the copy holds no card of is no tile: TCGdex lists Sample, W Promotional, Jumbo cards and
     Radiant Collection (Legendary Treasures' RC run, whose cards are in bw11) with none (Bart,
     2026-09-14). A set with no sync record yet is kept, as before. */
  const cards = new Map(sync.map((s) => [s.setId, s.cards]));
  return rows
    .filter((r) => cards.get(r.id) !== 0 && !DUPLICATE_SETS.has(r.id))
    .map((r): CatalogueSet => ({
      id: r.id,
      name: r.name,
      localName: null,
      series: r.series ?? "Other",
      releaseDate: r.release_date,
      total: r.total ?? 0,
      printedTotal: r.printed_total,
      cardsRecorded: true,
      logo: r.logo,
      symbol: r.symbol,
    }))
    .sort(byShelfOrder);
}

/**
 * One English set, whole, out of the copy: the answer englishSet() gives, without asking TCGdex.
 *
 * A set page read TCGdex twice per set (the record, then GraphQL for the rarities and types)
 * while the nightly run had written both down already. Null where the copy cannot answer, which
 * is a set it has no cards of yet: the caller asks TCGdex then, as before.
 *
 * The pictures are the copy's own, the ones the set page laid over TCGdex's built addresses
 * anyway (mirrorScans); a card the copy holds with no picture has none either way.
 */
export async function englishSetFromCopy(
  setId: string,
): Promise<{ set: CatalogueSet; cards: CatalogueMatch[] } | null> {
  const { adminClient } = await import("@/lib/storage/supabase");
  const db = adminClient();
  if (!db) return null;
  const all = await timed("copy sets", () => copiedSets(db));
  const row = copiedSetFor(all, setId);
  if (!row) return null;
  const rows = await timed("copy set cards", () => catalogueSetCards(db, row.id), row.id);
  if (!row || !rows.length) return null;
  const set: CatalogueSet = {
    id: row.id,
    name: row.name,
    localName: null,
    series: row.series ?? "Other",
    releaseDate: row.release_date,
    total: row.total ?? rows.length,
    printedTotal: row.printed_total,
    abbreviation: row.abbreviation,
    cardsRecorded: true,
    logo: row.logo,
    symbol: row.symbol,
  };
  const cards = rows.map((c): CatalogueMatch => ({
    id: c.id,
    number: c.local_id,
    name: c.name,
    localName: null,
    setName: set.name,
    series: set.series,
    ...storedScan(c.image),
    rarity: c.rarity,
    types: c.types ?? [],
    category: c.category ?? null,
    trainerType: c.trainer_type ?? null,
    ...copiedFullArt(c),
    tcgId: c.id,
  }));
  return { set, cards: inBinderOrder(cards) };
}

/**
 * Every set of a catalogue of its own (Japanese) out of the copy, in its shelf's order, the shape
 * listSetsIn() answers. Null where the copy holds none of that catalogue or cannot be read, and the
 * caller asks TCGdex as before.
 *
 * The shelf asked TCGdex for the series list and then each serie, fifteen requests, on every cold
 * instance (Bart, 2026-09-14: out of our own copy). The nightly run writes the shelf's order down
 * (sort_order) because these sets carry no date on the shelf, and leaves TCGdex's placeholder sets
 * out, as listSetsIn() does.
 */
export async function copiedLanguageSets(language: BrowseLanguage): Promise<CatalogueSet[] | null> {
  const { adminClient } = await import("@/lib/storage/supabase");
  const db = adminClient();
  if (!db) return null;
  const [rows, sync] = await Promise.all([
    copiedSets(db, language).catch(() => [] as CatalogueSetRecord[]),
    listCatalogueSync(db, language).catch(() => []),
  ]);
  if (!rows.length) return null;
  const held = new Map(sync.map((s) => [s.setId, s.cards]));
  // A set the catalogue lists with no cards, and TCGplayer has none of either, is no tile.
  return (
    rows
      .filter((r) => r.cards_recorded !== false)
      /* Newest first, as the English shelf reads. TCGdex's own listing order put Scarlet & Violet ahead
       of MEGA and scrambled each series (SV1V, SV9, SV11B), 2026-09-14; its order only breaks a tie. */
      .sort(
        (a, b) =>
          (b.release_date ?? "").localeCompare(a.release_date ?? "") ||
          (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9) ||
          a.id.localeCompare(b.id),
      )
      .map((r): CatalogueSet => ({
        id: r.id,
        name: r.name,
        localName: r.local_name ?? null,
        series: r.series ?? "",
        // No date on the tile, as the shelf has always shown these. The wordmark is Scrydex's, kept in
        // our bucket (scrydex-japan-logos.ts), where the copy has one.
        releaseDate: null,
        /* Never fewer than the cards the copy holds: TCGdex gives some XY and Sword & Shield sets their
         printed count as the total (Shiny Star V 190, 330 cards held), and a tile read over 100%. */
        total: Math.max(r.total ?? 0, held.get(r.id) ?? 0),
        printedTotal: r.printed_total,
        cardsRecorded: r.cards_recorded ?? true,
        logo: r.logo,
        symbol: null,
      }))
  );
}

/**
 * One set of a catalogue of its own out of the copy, with its cards: the answer setIn() gives,
 * pictures already resolved and kept in our bucket at night (mirror-language.ts), so the page asks
 * neither TCGdex nor Limitless. A set the catalogue lists without cards is that answer too. Null
 * where the copy does not hold the set, or holds it without the cards the catalogue lists.
 */
export async function languageSetFromCopy(
  language: BrowseLanguage,
  setId: string,
): Promise<{ set: CatalogueSet; cards: CatalogueMatch[] } | null> {
  const { adminClient } = await import("@/lib/storage/supabase");
  const db = adminClient();
  if (!db) return null;
  const all = await timed("copy sets", () => copiedSets(db, language));
  const row = all.find((r) => r.id === setId);
  if (!row) return null;
  const rows = row.cards_recorded
    ? await timed("copy set cards", () => catalogueSetCards(db, row.id, language), row.id)
    : [];
  if (row.cards_recorded && !rows.length) return null;
  const set: CatalogueSet = {
    id: row.id,
    name: row.name,
    localName: row.local_name ?? null,
    series: row.series ?? "",
    releaseDate: row.release_date,
    total: row.total ?? rows.length,
    printedTotal: row.printed_total,
    abbreviation: row.abbreviation,
    cardsRecorded: row.cards_recorded ?? true,
    logo: row.logo,
    symbol: row.symbol,
  };
  const cards = rows.map((c): CatalogueMatch => ({
    id: c.id,
    number: c.local_id,
    name: c.name,
    localName: c.local_name ?? null,
    setName: set.name,
    series: set.series || null,
    ...storedScan(c.image),
    rarity: c.rarity,
    types: c.types ?? [],
    category: c.category ?? null,
    trainerType: c.trainer_type ?? null,
    ...copiedFullArt(c),
    tcgId: c.id,
  }));
  return { set, cards };
}

/** One set's row of a catalogue's copy, read through the ten-minute list; null where it holds none. */
export async function copiedSetRow(
  language: CatalogueLanguage,
  setId: string,
): Promise<CatalogueSetRecord | null> {
  const { adminClient } = await import("@/lib/storage/supabase");
  const db = adminClient();
  if (!db) return null;
  return (await copiedSets(db, language)).find((r) => r.id === setId) ?? null;
}
