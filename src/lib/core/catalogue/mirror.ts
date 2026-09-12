/**
 * The English catalogue's copy in Postgres: the search reads it, the nightly cron fills it.
 *
 * Why there is a copy at all: a search asked TCGdex twice per keystroke, and the second call
 * — rarity and types for the twenty hits, over GraphQL, which nothing caches — took 1.7 to
 * 2.1 seconds on its own (measured 2026-09-11; "charizard" answered in 2.9 s cold and 1.5 s
 * with the list cached). A card's rarity does not change overnight, and 23,000 cards are a
 * small table, so the facts are copied in once and a search is one query: every word typed
 * must appear in the name, the number or the set name, and the answer comes back newest set
 * first, rarity and types included, without TCGdex in the path.
 *
 * What the copy is not: the truth. The catalogue is (see .claude/rules), and the copy is
 * refreshed from it set by set, missing and changed sets first. A search in another language
 * does not read it — those shelves have their own path (tcgdex-search.ts, searchEnglishNames)
 * — and before the first night has run, the copy is empty and the search asks TCGdex as it did.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type CatalogueCardRecord,
  type CatalogueQuery,
  catalogueCardsById,
  catalogueCopied,
  catalogueVersion,
  listCatalogueCards,
  listCatalogueSync,
  readCatalogueIndex,
  searchCatalogueCards,
  writeCatalogueIndex,
  writeCatalogueSet,
} from "@/lib/storage/postgres";
import { MAX_RESULTS, type CatalogueMatch, type SearchFilters } from "./ptcg-search";
import { englishScanGaps, englishSet, englishSets } from "./tcgdex-browse";
import { storedScan, tcgdexScan } from "./artwork";
import { ptcgScan } from "./ptcg";
import { mapLimit } from "../util";

/** The energy types a card can carry, as TCGdex names them. A word that is one is a type filter, not a name. */
export const ENERGY_TYPES = [
  "Grass",
  "Fire",
  "Water",
  "Lightning",
  "Psychic",
  "Fighting",
  "Darkness",
  "Metal",
  "Fairy",
  "Dragon",
  "Colorless",
];

/** However many words end up in one query — past this it's a paste, not a search. */
export const MAX_WORDS = 6;

const lower = (s: string) => s.trim().toLowerCase();
const energyType = (word: string) => ENERGY_TYPES.find((t) => lower(t) === lower(word));

/**
 * What the copy is asked, from the one box or from the filter fields — the same reading
 * tcgdex-search.ts gives a term: a word that is an energy type is the type filter, every other
 * word must be in the name, the number or the set name. Null where there is nothing to ask.
 */
export function mirrorQuery(input: string | SearchFilters): CatalogueQuery | null {
  if (typeof input === "string") {
    const words = input.trim().split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
    if (!words.length) return null;
    const query: CatalogueQuery = { words: [] };
    for (const word of words) {
      const type = energyType(word);
      if (type && !query.type) query.type = type;
      else query.words.push(word);
    }
    return query;
  }
  const query: CatalogueQuery = { words: [] };
  if (input.name?.trim()) query.name = input.name.trim();
  if (input.number?.trim()) query.number = input.number.trim();
  if (input.set?.trim()) query.set = input.set.trim();
  if (input.type?.trim()) query.type = energyType(input.type) ?? input.type.trim();
  return Object.keys(query).length > 1 ? query : null;
}

/** A hit as the add-card form reads it, off a row of the copy. */
const matchOf = (r: CatalogueCardRecord): CatalogueMatch => ({
  id: r.id,
  number: r.local_id,
  name: r.name,
  localName: null,
  setName: r.set_name,
  ...storedScan(r.image),
  rarity: r.rarity,
  types: r.types,
  series: r.series,
  tcgId: r.id,
});

/**
 * Whether the copy has anything in it, asked once per process and then remembered: for ten
 * minutes when it has, for one when it has not, so the first night's run is noticed within
 * the minute and an empty copy does not cost every search a count before its fallback.
 */
let copied: { at: number; value: boolean } | null = null;
const KNOWN_FOR_MS = { yes: 600_000, no: 60_000 };

async function hasCopy(db: SupabaseClient): Promise<boolean> {
  const ttl = copied?.value ? KNOWN_FOR_MS.yes : KNOWN_FOR_MS.no;
  if (copied && Date.now() - copied.at < ttl) return copied.value;
  const value = await catalogueCopied(db);
  copied = { at: Date.now(), value };
  return value;
}

/** Thrown away between tests. */
export const forgetCopy = () => {
  copied = null;
};

/**
 * One page of hits from the copy, or null where the copy is empty and TCGdex must be asked.
 * Throws where the store would not answer; the caller decides whether that is a fallback
 * or a failure.
 */
export async function searchMirror(
  db: SupabaseClient,
  input: string | SearchFilters,
  page = 1,
): Promise<{ cards: CatalogueMatch[]; total: number } | null> {
  if (!(await hasCopy(db))) return null;
  const query = mirrorQuery(input);
  if (!query) return { cards: [], total: 0 };
  const { rows, total } = await searchCatalogueCards(db, query, page, MAX_RESULTS);
  return { cards: rows.map(matchOf), total };
}

/** What one run of the sync did, for the cron's answer and its log. */
export type SyncReport = {
  /** Sets written this run, in the order they finished. */
  copied: string[];
  /** Sets that could not be read; tried again next run, still ahead of the up-to-date ones. */
  failed: string[];
  /** Sets the budget did not reach: missing, changed or older than the ones copied. */
  left: number;
  ms: number;
};

/** The scan's stem, off the address the set page builds: the size and the format are the reader's. */
const stemOf = (image: string | null) => image?.replace(/\/(low|high)\.webp$/, "") ?? null;

/**
 * The most cards of one set the second catalogue is asked about. A set TCGdex knows nothing of
 * would otherwise fire one lookup per card and find nothing; the gaps this closes are a handful
 * of promos in a set that is otherwise photographed.
 */
const FALLBACKS_PER_SET = 40;

/**
 * The picture each card of a set is copied under: TCGdex's built address where a file is behind
 * it, and the second catalogue's file where there is not.
 *
 * englishSet() builds every address from the serie, the set and the number, because TCGdex's
 * record names no scan for cards whose file is there all the same (see englishScanGaps). The
 * cards it names none for are the ones that can be a 404, and a 404 in the copy is what every
 * reader of the copy draws: a blank square in the search, on the set page and in the index
 * document. Pikachu with Grey Felt Hat (svp-085) is the one that showed it, the card the
 * collection has always found through pokemontcg.io and the search never did.
 *
 * The probe and the lookup are the copy's to pay, once a night, not a reader's per request:
 * that is the whole reason the copy exists. A card whose address holds nothing and whose
 * fallback finds nothing is copied with no picture, which is the honest answer and draws as
 * the card's name.
 */
async function withResolvedScans(
  setId: string,
  setName: string,
  cards: CatalogueMatch[],
): Promise<CatalogueMatch[]> {
  const gaps = await englishScanGaps(setId).catch(() => new Set<string>());
  if (!gaps.size) return cards;
  let fallbacks = FALLBACKS_PER_SET;
  return mapLimit(cards, 8, async (card) => {
    const stem = stemOf(card.image);
    if (!stem || !gaps.has(card.number)) return card;
    // tcgdexScan() answers the address itself where the probe could not be made, which reads
    // as "keep it": an unanswered check is not proof a scan is missing.
    if (await tcgdexScan(stem)) return card;
    if (fallbacks <= 0) return { ...card, image: null, imageHigh: null };
    fallbacks--;
    const file = await ptcgScan(setName, card.number, card.name).catch(() => null);
    return { ...card, image: file, imageHigh: null };
  });
}

/**
 * Copies as many sets as the budget allows, most needed first: a set the copy has never seen,
 * then one whose card count has moved since (a set that grew, a set that was empty), then the
 * rest oldest copy first. Each set is one REST read for its cards and one GraphQL call for
 * their facts, about two seconds together, four at a time; a run copies some eighty sets and
 * the whole catalogue is fresh again every few nights. A set whose facts could not be read is
 * skipped rather than written without them — the copy would answer null for its rarity for
 * days, where the live path answers it the next request.
 *
 * Every set is committed as it finishes, so a run cut short keeps what it did.
 */
export async function syncMirror(
  db: SupabaseClient,
  {
    budgetMs = 45_000,
    parallel = 4,
    now = Date.now,
  }: { budgetMs?: number; parallel?: number; now?: () => number } = {},
): Promise<SyncReport> {
  const start = now();
  const [index, done] = await Promise.all([englishSets(), listCatalogueSync(db)]);
  const record = new Map(done.map((d) => [d.setId, d]));
  const rank = (setId: string, total: number): [number, string] => {
    const seen = record.get(setId);
    if (!seen) return [0, ""];
    if (seen.cards !== total) return [1, seen.syncedAt];
    return [2, seen.syncedAt];
  };
  // The index is newest first; a tie within a rank keeps that, which is the order a
  // collector would pick too.
  const queue = index
    .map((s, i) => ({ id: s.id, key: rank(s.id, s.total), i }))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1].localeCompare(b.key[1]) || a.i - b.i)
    .map((s) => s.id);

  const report: SyncReport = { copied: [], failed: [], left: 0, ms: 0 };
  const next = () => (now() - start < budgetMs ? queue.shift() : undefined);
  const worker = async () => {
    for (let id = next(); id !== undefined; id = next()) {
      try {
        const read = await englishSet(id, { factsRequired: true });
        if (!read) {
          report.failed.push(id);
          continue;
        }
        const { set, cards } = read;
        const pictured = await withResolvedScans(id, set.name, cards);
        await writeCatalogueSet(
          db,
          id,
          pictured.map((c): CatalogueCardRecord => ({
            id: c.id,
            set_id: id,
            local_id: c.number,
            name: c.name,
            set_name: set.name,
            series: set.series,
            release_date: set.releaseDate,
            rarity: c.rarity,
            types: c.types,
            image: stemOf(c.image),
          })),
        );
        report.copied.push(id);
      } catch (err) {
        console.error(`[cron] copying ${id} failed:`, err instanceof Error ? err.message : err);
        report.failed.push(id);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, parallel) }, worker));
  report.left = queue.length;
  report.ms = Math.round(now() - start);
  return report;
}

// ── The document ────────────────────────────────────────────────────────────
//
// The whole copy as one document, for the browser to search in (see the catalogue_index
// migration for why). Compact on purpose: a set's name, era, date and scan folder are written
// once under its id, and each card is an array — id, set, number, name, rarity, types — with a
// seventh element only where its scan is not at the set's folder. Twenty-three thousand cards
// are about two megabytes plain and a few hundred kilobytes compressed.

/** One card in the document. The seventh element is the scan's stem where it is not `${set.image}/${number}`, or null for none. */
export type IndexCard = [string, string, string, string, string | null, string[], (string | null)?];
export type IndexSet = {
  name: string;
  series: string | null;
  date: string | null;
  image: string | null;
};
export type CatalogueIndex = {
  version: string;
  sets: Record<string, IndexSet>;
  cards: IndexCard[];
};

/** The sets' scan folder, off the first card that has one: every English scan sits at `folder/number`. */
export function buildIndex(version: string, rows: CatalogueCardRecord[]): CatalogueIndex {
  const sets: Record<string, IndexSet> = {};
  for (const r of rows) {
    const set = (sets[r.set_id] ??= {
      name: r.set_name,
      series: r.series,
      date: r.release_date,
      image: null,
    });
    if (!set.image && r.image && r.image.endsWith(`/${r.local_id}`))
      set.image = r.image.slice(0, -r.local_id.length - 1);
  }
  const cards = rows.map((r): IndexCard => {
    const folder = sets[r.set_id]?.image;
    const card: IndexCard = [r.id, r.set_id, r.local_id, r.name, r.rarity, r.types];
    if (r.image !== (folder ? `${folder}/${r.local_id}` : null)) card.push(r.image);
    return card;
  });
  return { version, sets, cards };
}

/**
 * The document, current to the copy: read as stored, rebuilt when the copy has been written
 * since — the cron rebuilds it after every copy, and a request finding it behind (or absent,
 * before the first cron) builds it once and keeps it. Null while the copy is empty.
 */
export async function catalogueIndex(
  db: SupabaseClient,
): Promise<{ version: string; body: string } | null> {
  const version = await catalogueVersion(db);
  if (!version) return null;
  const stored = await readCatalogueIndex(db, "en");
  if (stored && stored.version >= version) return stored;
  const body = JSON.stringify(buildIndex(version, await listCatalogueCards(db)));
  await writeCatalogueIndex(db, "en", version, body);
  return { version, body };
}

/**
 * The pictures the copy holds for these cards, by id, for a reader that has the cards from
 * TCGdex itself: the set page.
 *
 * The copy is where a picture has been checked (withResolvedScans): TCGdex's own address where
 * a file is behind it, the second catalogue's file where there is none, and nothing where
 * neither has one. The set page builds the address instead, so it drew a blank square for the
 * cards TCGdex has no scan of while the search, off the copy, had the answer. An id the copy
 * does not hold is left out, and the page keeps what it built: a set copied for the first time
 * tonight is no worse off than it was.
 */
export async function mirrorScans(
  db: SupabaseClient,
  ids: string[],
): Promise<Map<string, { image: string | null; imageHigh: string | null }>> {
  if (!ids.length) return new Map();
  const rows = await catalogueCardsById(db, ids);
  return new Map(rows.map((r) => [r.id, storedScan(r.image)]));
}

/** These cards of the copy as the add-card form reads them, in the order asked; an id the copy lacks is left out. */
export async function mirrorCards(db: SupabaseClient, ids: string[]): Promise<CatalogueMatch[]> {
  return (await catalogueCardsById(db, ids)).map(matchOf);
}
