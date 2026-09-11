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
  catalogueCopied,
  listCatalogueSync,
  searchCatalogueCards,
  writeCatalogueSet,
} from "@/lib/storage/postgres";
import { MAX_RESULTS, type CatalogueMatch, type SearchFilters } from "./ptcg-search";
import { englishSet, englishSets } from "./tcgdex-browse";

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
  image: r.image ? `${r.image}/low.webp` : null,
  imageHigh: r.image ? `${r.image}/high.webp` : null,
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
        await writeCatalogueSet(
          db,
          id,
          cards.map((c): CatalogueCardRecord => ({
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
