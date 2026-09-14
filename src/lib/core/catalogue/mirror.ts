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
import { withSetLogos } from "./set-logos";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type CatalogueCardRecord,
  type CatalogueLanguage,
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
  writeCatalogueSetRecord,
  listCatalogueSets,
  updateCatalogueSetArt,
} from "@/lib/storage/postgres";
import { MAX_RESULTS, type CatalogueMatch, type SearchFilters } from "./ptcg-search";
import { englishSet, englishSets, englishSetScans } from "./tcgdex-browse";
import { fullArtOf } from "./full-art";
import {
  isScanFile,
  limitlessScan,
  scrydexScan,
  storedScan,
  tcgdexScan,
  tcgplayerScan,
} from "./artwork";
import { canStoreImages, keepImage, storedAddress, tcgdexFolderMissing } from "./image-store";
import { ptcgScan } from "./ptcg";
import { mapLimit } from "../util";
import { languagesOfSet } from "./card-languages";

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
export function mirrorQuery(
  input: string | SearchFilters,
  { fullArt = false }: { fullArt?: boolean } = {},
): CatalogueQuery | null {
  if (typeof input === "string") {
    const words = input.trim().split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
    // Nothing typed and nothing asked is no query. Full art on its own is a question, though:
    // every full art in the catalogue, newest set first, which is a shelf worth walking.
    if (!words.length && !fullArt) return null;
    const query: CatalogueQuery = { words: [], ...(fullArt ? { fullArt: true } : {}) };
    for (const word of words) {
      const type = energyType(word);
      if (type && !query.type) query.type = type;
      else query.words.push(word);
    }
    return query;
  }
  const query: CatalogueQuery = { words: [], ...(fullArt ? { fullArt: true } : {}) };
  if (input.name?.trim()) query.name = input.name.trim();
  if (input.number?.trim()) query.number = input.number.trim();
  if (input.set?.trim()) query.set = input.set.trim();
  if (input.type?.trim()) query.type = energyType(input.type) ?? input.type.trim();
  // `words` is always there, so one more key means something was actually asked for. Full art on
  // its own is a question: every full art in the catalogue, newest set first.
  return Object.keys(query).length > 1 ? query : null;
}

/** A hit as the add-card form reads it, off a row of the copy. */
const matchOf = (r: CatalogueCardRecord): CatalogueMatch => ({
  id: r.id,
  number: r.local_id,
  name: r.name,
  localName: r.local_name ?? null,
  setName: r.set_name,
  ...storedScan(r.image),
  rarity: r.rarity,
  types: r.types,
  series: r.series,
  category: r.category ?? null,
  trainerType: r.trainer_type ?? null,
  tcgId: r.id,
});

/**
 * Whether the copy has anything in it, asked once per process and then remembered: for ten
 * minutes when it has, for one when it has not, so the first night's run is noticed within
 * the minute and an empty copy does not cost every search a count before its fallback.
 */
const copied = new Map<CatalogueLanguage, { at: number; value: boolean }>();
const KNOWN_FOR_MS = { yes: 600_000, no: 60_000 };

async function hasCopy(db: SupabaseClient, language: CatalogueLanguage): Promise<boolean> {
  const known = copied.get(language);
  const ttl = known?.value ? KNOWN_FOR_MS.yes : KNOWN_FOR_MS.no;
  if (known && Date.now() - known.at < ttl) return known.value;
  const value = await catalogueCopied(db, language);
  copied.set(language, { at: Date.now(), value });
  return value;
}

/** Thrown away between tests. */
export const forgetCopy = () => {
  copied.clear();
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
  { fullArt = false, language = "en" }: { fullArt?: boolean; language?: CatalogueLanguage } = {},
): Promise<{ cards: CatalogueMatch[]; total: number } | null> {
  if (!(await hasCopy(db, language))) return null;
  const query = mirrorQuery(input, { fullArt });
  if (!query) return { cards: [], total: 0 };
  const { rows, total } = await searchCatalogueCards(db, query, page, MAX_RESULTS, language);
  return { cards: rows.map(matchOf), total };
}

/** What one run of the sync did, for the cron's answer and its log. */
/** Whether a source answers that the file is not there, as opposed to not answering at all. */
async function sourceMissing(address: string): Promise<boolean> {
  try {
    const head = await fetch(address, { method: "HEAD", cache: "no-store" });
    return head.status === 404 || head.status === 403;
  } catch {
    return false;
  }
}

/**
 * A logo or symbol address as the copy should hold it: ours once the file is in the bucket, and
 * none where the source has no file at all.
 *
 * On 2026-09-14 every set symbol TCGdex names (163 English, 4 Japanese) answered 404, and two
 * logos (Undaunted, Furious Fists) exist only as PNG: the copy kept all of them as addresses on
 * TCGdex's host, which a page would have loaded and found nothing behind. A file TCGdex publishes
 * as PNG only is taken as PNG; a file that is not there becomes no address; a source that did not
 * answer keeps its address, to be copied the next night.
 */
export const ownArt = async (address: string | null, storing: boolean): Promise<string | null> => {
  if (!storing || !address || !storedAddress(address)) return address;
  const kept = await keepImage(address);
  if (kept !== address) return kept;
  const png =
    address.startsWith("https://assets.tcgdex.net/") && address.endsWith(".webp")
      ? address.replace(/\.webp$/, ".png")
      : null;
  if (png) {
    const keptPng = await keepImage(png);
    if (keptPng !== png) return keptPng;
  }
  const gone = (await sourceMissing(address)) && (!png || (await sourceMissing(png)));
  return gone ? null : address;
};

/**
 * Every set's logo and symbol copied into our bucket, and the copy's addresses pointed at it.
 *
 * Bart, 2026-09-14: pages read our own copy, and the art on a shelf tile was the one thing still
 * loaded from somebody else's host (assets.tcgdex.net, images.pokemontcg.io) on every view. A set
 * whose file cannot be copied keeps its source address and is tried again the next night.
 * Returns how many sets had an address rewritten.
 */
export async function storeSetArt(db: SupabaseClient): Promise<number> {
  const rows = await listCatalogueSets(db);
  const pending = rows.filter(
    (r) => (r.logo && storedAddress(r.logo)) || (r.symbol && storedAddress(r.symbol)),
  );
  let rewritten = 0;
  await mapLimit(pending, 8, async (r) => {
    const [logo, symbol] = await Promise.all([ownArt(r.logo, true), ownArt(r.symbol, true)]);
    if (logo === r.logo && symbol === r.symbol) return;
    await updateCatalogueSetArt(db, r.id, { logo, symbol });
    rewritten++;
  });
  return rewritten;
}

/**
 * The shape of copy a set is written in. A set the copy holds in an older shape is copied again
 * ahead of the up-to-date ones, the way a set whose card count moved is, without working its
 * pictures out afresh. 1: the sheet's facts, printed languages and the set's serie
 * (migration 20260914220000).
 */
export const CATALOGUE_FORMAT = 1;

export type SyncReport = {
  /** Sets written this run, in the order they finished. */
  copied: string[];
  /** Sets that could not be read; tried again next run, still ahead of the up-to-date ones. */
  failed: string[];
  /** Sets the budget did not reach: missing, changed or older than the ones copied. */
  left: number;
  /**
   * Cards whose picture is not the one the copy held before this run: a scan found, a picture
   * moved into our bucket, a card new to the copy. The collection keeps a set's pictures for a
   * day (set-facts in collection.ts), so a run that changes any tells the route to drop them.
   */
  pictures: number;
  /** Sets whose logo or symbol address was moved into our bucket this run (storeSetArt). */
  art: number;
  ms: number;
};

/** The scan's stem, off the address the set page builds: the size and the format are the reader's. */
const stemOf = (image: string | null) => image?.replace(/\/(low|high)\.webp$/, "") ?? null;

/**
 * How many cards of one set the other two catalogues are asked about before a set they answer
 * nothing for is given up on. A set neither has (a trainer kit, a McDonald's run) would otherwise
 * fire one lookup per card and find nothing.
 *
 * It used to be a ceiling on every set, 40 lookups whatever they found, and that is what left
 * 213 cards with no picture on 2026-09-13: a set whose gaps run past 40 got its first 40 and a
 * blank for the rest, though pokemontcg.io had every one of them. Crown Zenith's Galarian
 * Gallery stopped at GG40 (Giratina VSTAR is GG69), Shining Fates' Shiny Vault at 40 of 122,
 * Dragon Majesty, Shining Legends and SM Black Star Promos the same. So a set that answers keeps
 * being asked, and only one that has said nothing this many times is left alone.
 */
const FALLBACK_MISSES_BEFORE_GIVING_UP = 10;

/**
 * The picture each card of a set is copied under: TCGdex's built address where a file is behind
 * it, and one of the two other catalogues' file where there is not.
 *
 * englishSet() builds every address from the serie, the set and the number, because TCGdex's
 * record names no scan for cards whose file is there all the same (see englishSetScans). The
 * cards it names none for are the ones that can be a 404, and a 404 in the copy is what every
 * reader of the copy draws: a blank square in the search, on the set page and in the index
 * document. Pikachu with Grey Felt Hat (svp-085) is the one that showed it, the card the
 * collection has always found through pokemontcg.io and the search never did.
 *
 * The chain is the collection's own (cards.ts): the built address, then Limitless under the
 * set's printed abbreviation, then pokemontcg.io. Limitless has Oddish (svp-102) where
 * pokemontcg.io has the Pikachu, so the two together answer more than either.
 *
 * ── What is asked again, and what is not ───────────────────────────────────
 *
 * The probe and the lookups are the copy's to pay, not a reader's per request: that is the
 * whole reason the copy exists. But a nightly pass that asks them again for every gap of every
 * set turns 11 seconds into 46 (measured 2026-09-12, 105 sets), so a full refresh takes two
 * nights instead of one. A set that is new to the copy, or whose card count has moved, is
 * worked out in full. A set that is merely the oldest keeps every answer it already has, and
 * only its cards with no picture at all are probed again, in case TCGdex has published one
 * since: one HEAD each, and no lookup behind it, because those two have already said no. The
 * exception is a set the other two do have files for: there a blank card is asked again.
 *
 * A card whose address holds nothing and whose fallbacks find nothing is copied with no
 * picture, which is the honest answer and draws as the card's name.
 */
async function withResolvedScans(
  db: SupabaseClient,
  setId: string,
  setName: string,
  cards: CatalogueMatch[],
  /** The set is new to the copy or its card count has moved: every gap is worked out afresh. */
  fresh: boolean,
): Promise<CatalogueMatch[]> {
  const { gaps, code } = await englishSetScans(setId).catch(() => ({
    gaps: new Set<string>(),
    code: null,
  }));
  if (!gaps.size) return cards;
  const gapCards = cards.filter((c) => gaps.has(c.number));
  /* What the copy already worked out for these cards. Empty for a set it has never seen, and
     not asked for at all where the set is being worked out in full anyway. A store that will
     not answer costs this set its shortcut, not its pictures. */
  const known = fresh
    ? new Map<string, string | null>()
    : await catalogueCardsById(
        db,
        gapCards.map((c) => c.id),
      )
        .then((rows) => new Map(rows.map((r) => [r.id, r.image])))
        .catch(() => new Map<string, string | null>());
  let asked = 0;
  let found = 0;
  /* The other two have a file for another card of this set already in the copy, so a card of it
     with none was very likely never asked about: the ceiling this used to have cut the set off
     (FALLBACK_MISSES_BEFORE_GIVING_UP). Those cards are asked again rather than kept blank. */
  const answeredElsewhere = [...known.values()].some(
    (image) => image !== null && isScanFile(image),
  );
  const at = (card: CatalogueMatch, file: string | null) => ({
    ...card,
    image: file,
    imageHigh: null,
  });
  return mapLimit(cards, 8, async (card) => {
    const stem = stemOf(card.image);
    if (!stem || !gaps.has(card.number)) return card;
    const answered = known.get(card.id);
    // A picture the copy already holds for this card is kept as it is: it was checked, and
    // checking it again is two requests for the same answer.
    if (answered) return at(card, answered);
    // tcgdexScan() answers the address itself where the probe could not be made, which reads
    // as "keep it": an unanswered check is not proof a scan is missing.
    if (await tcgdexScan(stem)) return card;
    // The copy has already asked the other two about this card and neither had it. Only the
    // built address is worth checking again, and that is what just happened; unless they do
    // have this set, where the blank is more likely a question never asked.
    if (known.has(card.id) && !answeredElsewhere) return at(card, null);
    if (found === 0 && asked >= FALLBACK_MISSES_BEFORE_GIVING_UP) return at(card, null);
    asked++;
    /* Limitless first, where the set has a code there, and never for a lettered number: it
       renumbers a gallery's cards into the parent's run, and a guessed offset shows a
       confidently wrong card (cards.ts). Then TCGplayer, by the product the price links name
       for this card id, so nothing is guessed. Then pokemontcg.io, which is asked by set name, and
       last Scrydex, for the sets read by hand in artwork.ts. */
    const file =
      (code && !/^[A-Za-z]/.test(card.number)
        ? await limitlessScan(code, card.number).catch(() => null)
        : null) ??
      (await tcgplayerScan(card.id).catch(() => null)) ??
      (await ptcgScan(setName, card.number, card.name).catch(() => null)) ??
      (await scrydexScan(setId, card.number).catch(() => null));
    if (file) found++;
    return at(card, file);
  });
}

/**
 * Every picture of a set in our own bucket (image-store.ts), the address the copy keeps being ours
 * wherever the file is there.
 *
 * A card whose copy already holds our address for this very source is kept without a request:
 * that is every card of a set after its first pass, so a nightly refresh asks nothing here. The
 * rest are copied, eight at a time; one that cannot be keeps the source's address and is tried
 * again the next time its set comes up. Without the write secret this returns the cards as they
 * are, which is how a local run and the tests behave.
 */
async function withStoredImages(
  cards: CatalogueMatch[],
  /** The pictures the copy holds for these cards now, by id. */
  held: Map<string, string | null>,
  /** canStoreImages(), asked once per run rather than once per set. */
  storing: boolean,
): Promise<CatalogueMatch[]> {
  if (!storing || !cards.length) return cards;
  return mapLimit(cards, 8, async (card) => {
    const stem = stemOf(card.image);
    const ours = stem ? storedAddress(stem) : null;
    if (!stem || !ours) return card;
    const image = held.get(card.id) === ours ? ours : await keepImage(stem);
    if (image !== stem) return { ...card, image, imageHigh: null };
    /* TCGdex names this scan and has no file behind it (tcgdexFolderMissing). TCGplayer's, by
       the card's product, is the picture then, copied like any other. */
    if (!(await tcgdexFolderMissing(stem))) return card;
    const product = await tcgplayerScan(card.id).catch(() => null);
    const kept = product ? await keepImage(product) : null;
    return kept && kept !== product ? { ...card, image: kept, imageHigh: null } : card;
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
 *
 * `full` works every set out from scratch rather than keeping the pictures the copy already
 * has (withResolvedScans). For the day the chain itself changes: the cards that were copied
 * without a picture were told "no" by the sources of that day, and a source added since is
 * never asked about them otherwise. It costs a run its speed, so it is asked for by hand and
 * the nightly one never sets it.
 */
export async function syncMirror(
  db: SupabaseClient,
  {
    budgetMs = 45_000,
    parallel = 4,
    now = Date.now,
    full = false,
  }: { budgetMs?: number; parallel?: number; now?: () => number; full?: boolean } = {},
): Promise<SyncReport> {
  const start = now();
  const [index, done] = await Promise.all([englishSets(), listCatalogueSync(db)]);
  const record = new Map(done.map((d) => [d.setId, d]));
  const rank = (setId: string, total: number): [number, string] => {
    const seen = record.get(setId);
    if (!seen) return [0, ""];
    if (seen.cards !== total || seen.format < CATALOGUE_FORMAT) return [1, seen.syncedAt];
    return [2, seen.syncedAt];
  };
  // The index is newest first; a tie within a rank keeps that, which is the order a
  // collector would pick too.
  const ranked = index
    .map((s, i) => ({ id: s.id, key: rank(s.id, s.total), i }))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1].localeCompare(b.key[1]) || a.i - b.i);
  const queue = ranked.map((s) => s.id);
  /* The sets worth working out in full: never seen, or their card count has moved. The rest is
     a refresh of what the copy already has, and keeps the pictures it worked out before
     (withResolvedScans). */
  const totals = new Map(index.map((s) => [s.id, s.total]));
  const fresh = new Set(
    full
      ? ranked.map((s) => s.id)
      : ranked.filter((s) => record.get(s.id)?.cards !== totals.get(s.id)).map((s) => s.id),
  );

  const storing = await canStoreImages();
  const report: SyncReport = { copied: [], failed: [], left: 0, pictures: 0, art: 0, ms: 0 };
  // Every set's logo and symbol into our bucket first: a few hundred small files, and after the
  // first night only the sets whose art is not ours yet are looked at.
  if (storing)
    report.art = await storeSetArt(db).catch((err) => {
      console.error("[cron] storing set art failed:", err instanceof Error ? err.message : err);
      return 0;
    });
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
        /* Which Western languages each card was printed in: one read of the set per catalogue.
           A failure leaves the set's languages unknown, which the sheet answers as TCGdex would. */
        const languagesOf = await languagesOfSet(id).catch(() => () => null);
        /* What the copy holds for this set before the run writes it. A store that will not
           answer counts every card as changed, which costs the collection a day's cache early
           and never a stale picture. */
        const held = await catalogueCardsById(
          db,
          cards.map((c) => c.id),
        )
          .then((rows) => new Map(rows.map((r) => [r.id, r.image])))
          .catch(() => new Map<string, string | null>());
        const pictured = await withStoredImages(
          await withResolvedScans(db, id, set.name, cards, fresh.has(id)),
          held,
          storing,
        );
        report.pictures += pictured.filter(
          (c) => !held.has(c.id) || held.get(c.id) !== stemOf(c.image),
        ).length;
        /* Which of the set's cards are full art, worked out here because this is the one place
           that holds a whole set: the rule is about a card's place in it (full-art.ts). */
        const arts = fullArtOf(pictured);
        // The set itself, beside its cards. Written first, and on its own line rather than
        // folded into writeCatalogueSet(): a collection read resolves its sets by name out of
        // this table (loadSetCatalogue), so a set whose cards are in the copy and whose own row
        // is not would resolve to nothing at all.
        await writeCatalogueSetRecord(db, {
          id,
          name: set.name,
          series: set.series,
          release_date: set.releaseDate,
          // Resolved here, at night, as the shelf shows it: the promo star, and pokemontcg.io's
          // wordmark where TCGdex has none (set-logos.ts). The pages read this column and ask
          // nobody (copiedEnglishSets, Bart 2026-09-14).
          logo: await ownArt((await withSetLogos([set]))[0]?.logo ?? set.logo, storing),
          symbol: await ownArt(set.symbol, storing),
          abbreviation: set.abbreviation ?? null,
          total: set.total,
          printed_total: set.printedTotal,
          serie_id: set.serieId ?? null,
        });
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
            category: c.category ?? null,
            trainer_type: c.trainerType ?? null,
            full_art: arts.has(c),
            // The sheet's facts, so opening a card asks nobody (getCardDetail).
            illustrator: c.sheet?.illustrator ?? null,
            hp: c.sheet?.hp ?? null,
            stage: c.sheet?.stage ?? null,
            evolve_from: c.sheet?.evolveFrom ?? null,
            regulation_mark: c.sheet?.regulationMark ?? null,
            first_edition: c.sheet?.firstEdition ?? null,
            variants: c.sheet?.variants ?? null,
            languages: languagesOf(c.id),
          })),
          500,
          CATALOGUE_FORMAT,
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
 * Appended to the copy's version, so a document built before a change to its shape or its order
 * is behind the copy and built again, and its ETag moves with it. "#n2": the cards in binder
 * order (number_order) instead of by the number as a string. A stored version without it
 * compares lower than the same copy with it, and a later copy compares higher than either.
 */
const INDEX_FORMAT = "#n2";

/**
 * The document, current to the copy: read as stored, rebuilt when the copy has been written
 * since — the cron rebuilds it after every copy, and a request finding it behind (or absent,
 * before the first cron) builds it once and keeps it. Null while the copy is empty.
 */
export async function catalogueIndex(
  db: SupabaseClient,
): Promise<{ version: string; body: string } | null> {
  const copied = await catalogueVersion(db);
  if (!copied) return null;
  const version = `${copied}${INDEX_FORMAT}`;
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
