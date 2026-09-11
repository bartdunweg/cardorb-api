import IDS_JA from "../cardmarket-ids.ja.generated.json";
import IDS_KO from "../cardmarket-ids.ko.generated.json";
import IDS_ZH_CN from "../cardmarket-ids.zh-cn.generated.json";
import IDS_ZH_TW from "../cardmarket-ids.zh-tw.generated.json";
import { CatalogueNotFound, graphql, json } from "./tcgdex-client";
import JA_NAMES from "./set-names.ja.json";
import ZH_NAMES from "./set-names.zh.json";
import ZH_CN_NAMES from "./set-names.zh-cn.json";
import PTCG_SET_IDS from "./ptcg-set-ids.json";
import type { CatalogueMatch } from "./ptcg-search";
import { cardNamed } from "./card-names";

/** One set, with enough to render a tile and sort a shelf. */
export type CatalogueSet = {
  id: string;
  name: string;
  /** The era, as TCGdex names it — its serie. */
  series: string;
  /** "YYYY/MM/DD" — sortable as a string. */
  releaseDate: string | null;
  /** Every card in the set, secret rares included. */
  total: number;
  /** The number printed on the cards ("165" of a set that actually holds 207). */
  printedTotal: number | null;
  logo: string | null;
  symbol: string | null;
  /** The set's name in its own language where `name` is a translation (a Japanese set); null for English. */
  localName: string | null;
  /**
   * Whether the catalogue has recorded the set's cards, or only the set and its count. Always
   * true for English; TCGdex lists 68 of 184 Japanese sets and 92 of 95 Korean ones with a count
   * and no card (2026-09-11), and a shelf that could not tell showed "0 of 60" for those.
   */
  cardsRecorded: boolean;
};

/**
 * The shelf and the set pages: every language TCGdex carries, English included.
 *
 * ── English, since 2026-09-11 ────────────────────────────────────────────────
 *
 * The English shelf asked pokemontcg.io (ptcg-browse.ts, now gone) for the
 * reason its header gave: TCGdex's set listing carries no rarity and no types,
 * so a 207-card set would have been 207 requests. That was true of the REST
 * listing and is not true of TCGdex's GraphQL endpoint, which filters cards by
 * id and answers a whole set's rarities and types in one call (measured: 207
 * of 207 for 151, 240 ms). And pokemontcg.io had started refusing three
 * requests in five — measured the same day for the search (tcgdex-search.ts),
 * and for these routes: 2 of 8 for the set list, 1 of 8 for a set's cards —
 * behind a day-long cache that hid it until an entry went cold.
 *
 * So the English shelf reads like the other four: TCGdex's own ids, names,
 * eras and scans. A set is two reads — its record and card list (a cached
 * GET), and its rarities and types (GraphQL, memoised nowhere, 240 ms) — and
 * the shelf is one, the set index below, held for a day per process.
 *
 * Set ids changed with the source: pokemontcg.io numbers 151 `sv3pt5`, TCGdex
 * `sv03.5`. 122 of 174 are the same string; the other 52 are in
 * ptcg-set-ids.json, and englishSet() reads a pokemontcg.io id through it, so
 * a link from before this day still opens the set it opened. The contract
 * (`GET /v1/catalog/sets/{setId}`) says which id the shelf now hands out.
 *
 * ── The other languages ──────────────────────────────────────────────────────
 *
 * pokemontcg.io knows the English game only. TCGdex carries a catalogue per
 * language — Japanese, Chinese (traditional and simplified), Korean — with its
 * own sets and ids, named in that language (there is no English name for a
 * Japanese set, and inventing one would be a second identity to keep straight).
 * The shapes below are the English shelf's, so a client draws them with the
 * same code; `series` is TCGdex's serie name, `releaseDate` the set's own.
 *
 * Pictures: TCGdex's set listing carries none, and a Japanese card's own record
 * often says `image: null` while the file is there all the same, at the address
 * every scan has — language, serie, set, number. So the address is built, not
 * read. A card the assets do not have draws as the name, the way an unpictured
 * English promo does.
 *
 * Names: a Japanese set is shown under an English name where set-names.ja.json
 * has one — the katakana of an English phrase, or Bulbapedia's rendering — with
 * the Japanese name kept beside it as `localName`, since that is what the pack
 * says. A set the list does not know keeps its own name. The list is a
 * translation, not a catalogue fact: correct it, do not trust it.
 *
 * The cards are named the same way, from a bigger source (card-names.ts):
 * Cardmarket sells these cards to Europe under English names, and its product
 * list — read through the committed product id maps — names 10,350 of the
 * 12,781 Japanese cards; a Pokémon it does not sell is named by its species
 * and printed suffix, for 12,308 in all (2026-09-11). The printed name rides
 * beside as `localName`. The app is
 * English throughout, and リザードンex under a card everyone here calls
 * Charizard ex was the one place it was not.
 */
// The Chinese and Korean catalogues print the Japanese sets under the same ids (S12a, SV9), so
// the Japanese list names those; the sets those languages have of their own get their own lists.
const JA = JA_NAMES as Record<string, string>;
const ZH = ZH_NAMES as Record<string, string>;
const ENGLISH: Partial<Record<BrowseLanguage, Record<string, string>>> = {
  ja: JA,
  ko: JA,
  "zh-tw": { ...JA, ...ZH },
  "zh-cn": { ...JA, ...ZH, ...(ZH_CN_NAMES as Record<string, string>) },
};

const named = (
  lang: BrowseLanguage,
  id: string,
  own: string,
): { name: string; localName: string | null } => {
  const english = ENGLISH[lang]?.[id];
  return english ? { name: english, localName: own } : { name: own, localName: null };
};

/**
 * The eras, by TCGdex's serie id, which the four catalogues share (S is Sword & Shield in all
 * of them). TCGdex names each in the catalogue's own language — ポケモンカードゲーム
 * スカーレット&バイオレット, 劍＆盾, 썬&문 — and the shelf groups its sets under that heading. The
 * English is the era's, as the English shelf writes it; a serie this does not know keeps its own.
 */
const SERIES_ENGLISH: Record<string, string> = {
  PMCG: "Original",
  neo: "Neo",
  VS: "VS",
  web: "web",
  e: "e-Card",
  ADV: "ADV",
  PCG: "PCG",
  L: "LEGEND",
  XY: "XY",
  XYb: "XY BREAK",
  SM: "Sun & Moon",
  S: "Sword & Shield",
  SV: "Scarlet & Violet",
  M: "MEGA",
};
const seriesNamed = (serieId: string | undefined, own: string | undefined): string =>
  (serieId && SERIES_ENGLISH[serieId]) || own || "";
export const BROWSE_LANGUAGES = ["ja", "zh-tw", "zh-cn", "ko"] as const;
export type BrowseLanguage = (typeof BROWSE_LANGUAGES)[number];

export const isBrowseLanguage = (v: unknown): v is BrowseLanguage =>
  typeof v === "string" && (BROWSE_LANGUAGES as readonly string[]).includes(v);

type TcgSerieBrief = { id: string; name: string };
type TcgSerie = TcgSerieBrief & {
  sets?: { id: string; name: string; cardCount?: { total?: number; official?: number } }[];
};
type TcgSetDetail = {
  id: string;
  name: string;
  logo?: string | null;
  symbol?: string | null;
  releaseDate?: string | null;
  serie?: { id: string; name: string };
  cardCount?: { total?: number; official?: number };
  cards?: { id: string; localId: string; name: string }[];
};

const HOST = "https://api.tcgdex.net/v2";

const scan = (lang: string, serie: string, set: string, localId: string, size: "low" | "high") =>
  `https://assets.tcgdex.net/${lang}/${serie}/${set}/${localId}/${size}.webp`;

/** Every set of the language, series by series in TCGdex's order, newest serie first. */
/**
 * The sets a catalogue has recorded cards for, read off the committed Cardmarket id maps: a
 * card is in there for every card TCGdex lists, product or none, so a set with no entry is a
 * set TCGdex lists without a card. The shelf's own read (the series list) says "60 cards" for
 * those too, and finding out live is one request per set — 184 for the Japanese shelf.
 *
 * As current as the last run of scripts/language-cardmarket-ids.mjs: a set TCGdex fills in
 * after that reads as unrecorded until the next run, on the shelf only — its own page reads
 * the cards live and shows them.
 */
const recordedSets = (() => {
  const maps: Record<BrowseLanguage, Record<string, unknown>> = {
    ja: IDS_JA,
    ko: IDS_KO,
    "zh-cn": IDS_ZH_CN,
    "zh-tw": IDS_ZH_TW,
  };
  const known = new Map<BrowseLanguage, Set<string>>();
  return (lang: BrowseLanguage): Set<string> => {
    let sets = known.get(lang);
    if (!sets) {
      sets = new Set(Object.keys(maps[lang]).map((id) => id.slice(0, id.lastIndexOf("-"))));
      known.set(lang, sets);
    }
    return sets;
  };
})();

export async function listSetsIn(lang: BrowseLanguage): Promise<CatalogueSet[]> {
  const series = (await json(`${HOST}/${lang}/series`, `${lang} series`)) as TcgSerieBrief[];
  const out: CatalogueSet[] = [];
  // Newest serie first, as the English shelf reads; TCGdex lists oldest first.
  for (const brief of [...series].reverse()) {
    const serie = (await json(
      `${HOST}/${lang}/series/${brief.id}`,
      `${lang} serie ${brief.id}`,
    )) as TcgSerie;
    for (const s of [...(serie.sets ?? [])].reverse()) {
      out.push({
        id: s.id,
        ...named(lang, s.id, s.name),
        series: seriesNamed(brief.id, serie.name),
        releaseDate: null,
        total: s.cardCount?.total ?? 0,
        printedTotal: s.cardCount?.official ?? null,
        cardsRecorded: recordedSets(lang).has(s.id),
        // No logo anywhere for these sets; a card stood in for a while and read as the wrong thing.
        logo: null,
        symbol: null,
      });
    }
  }
  return out;
}

/** One set with its cards, or null where the language has no set by that id. */
export async function setIn(
  lang: BrowseLanguage,
  setId: string,
): Promise<{ set: CatalogueSet; cards: CatalogueMatch[] } | null> {
  let detail: TcgSetDetail;
  try {
    detail = (await json(
      `${HOST}/${lang}/sets/${encodeURIComponent(setId)}`,
      `${lang} set ${setId}`,
    )) as TcgSetDetail;
  } catch (err) {
    if (err instanceof Error && err.name === "CatalogueNotFound") return null;
    throw err;
  }
  const serieId = detail.serie?.id ?? "";
  const set: CatalogueSet = {
    id: detail.id,
    ...named(lang, detail.id, detail.name),
    series: seriesNamed(serieId, detail.serie?.name),
    releaseDate: detail.releaseDate ? detail.releaseDate.replaceAll("-", "/") : null,
    total: detail.cardCount?.total ?? detail.cards?.length ?? 0,
    printedTotal: detail.cardCount?.official ?? null,
    cardsRecorded: (detail.cards ?? []).length > 0,
    logo: detail.logo ? `${detail.logo}.png` : null,
    symbol: detail.symbol ? `${detail.symbol}.png` : null,
  };
  const cards: CatalogueMatch[] = (detail.cards ?? []).map((c) => ({
    id: c.id,
    number: c.localId,
    ...cardNamed(lang, c.id, c.name),
    setName: set.name,
    image: serieId ? scan(lang, serieId, detail.id, c.localId, "low") : null,
    imageHigh: serieId ? scan(lang, serieId, detail.id, c.localId, "high") : null,
    rarity: null,
    types: [],
    series: seriesNamed(serieId, detail.serie?.name) || null,
    // TCGdex's id, the same as `id`: what a row of this language is filed under, and the only
    // way POST /cards can find a card whose set has no English name (#257). The English shelf
    // carried it from the start; this one sent none, and the web had nothing to send back.
    tcgId: c.id,
  }));
  return { set, cards };
}

// ── English ────────────────────────────────────────────────────────────────

/** A TCGdex date, "YYYY-MM-DD", as every shelf writes it: "YYYY/MM/DD", sortable as a string. */
const shelfDate = (d: string | null | undefined) => (d ? d.replaceAll("-", "/") : null);

type TcgSetIndexJson = {
  id: string;
  name?: string | null;
  logo?: string | null;
  symbol?: string | null;
  releaseDate?: string | null;
  cardCount?: { official?: number | null; total?: number | null } | null;
  serie?: { id?: string | null; name?: string | null } | null;
};

/**
 * The serie TCGdex files Pokémon TCG Pocket under: the mobile game's cards,
 * fifteen sets of them, which TCGdex carries beside the printed ones and
 * pokemontcg.io never did. A binder cannot hold one, so the shelf, the set
 * pages and the search leave them out — the ids are kept so the search can
 * tell a hit from one apart, and a page asked for one answers 404.
 */
const POCKET_SERIE = "tcgp";
let pocketSets = new Set<string>();

/** True for a set of the mobile game, which the English shelf does not show. */
export const isPocketSet = (setId: string) => pocketSets.has(setId);

/**
 * Every English set TCGdex knows, newest first, held for a day per process.
 *
 * One GraphQL call for 218 sets with era, date, counts and art, where the REST
 * listing has neither era nor date. Memoised as the promise, not the value, so
 * ten shelves opened at once make one request; a failure is not kept, so the
 * next shelf asks again. Read by the shelf, by the ownership join (which files
 * a row under the set it resolves to) and by the search (which names a hit's
 * set and era from the id).
 */
let english: { at: number; sets: Promise<CatalogueSet[]> } | null = null;
const ENGLISH_TTL_MS = 86_400_000;

async function fetchEnglishSets(): Promise<CatalogueSet[]> {
  const body = (await graphql(
    "{ sets { id name logo symbol releaseDate cardCount { official total } serie { id name } } }",
    "en set index",
  )) as { sets?: (TcgSetIndexJson | null)[] } | null;
  const out: CatalogueSet[] = [];
  const pocket = new Set<string>();
  for (const s of body?.sets ?? []) {
    if (!s?.name) continue;
    if (s.serie?.id === POCKET_SERIE) {
      pocket.add(s.id);
      continue;
    }
    out.push({
      id: s.id,
      name: s.name,
      localName: null,
      series: s.serie?.name ?? "Other",
      releaseDate: shelfDate(s.releaseDate),
      total: s.cardCount?.total ?? 0,
      printedTotal: s.cardCount?.official ?? null,
      cardsRecorded: true,
      logo: s.logo ? `${s.logo}.webp` : null,
      symbol: s.symbol ? `${s.symbol}.webp` : null,
    });
  }
  if (!out.length) throw new Error("TCGdex answered no sets");
  pocketSets = pocket;
  // Newest first, as every set list in the app reads: a collector opening the
  // shelf is looking for the set that just came out far more often than for Base.
  return out.sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
}

export function englishSets(): Promise<CatalogueSet[]> {
  if (english && Date.now() - english.at < ENGLISH_TTL_MS) return english.sets;
  const sets = fetchEnglishSets().catch((err) => {
    english = null;
    throw err;
  });
  english = { at: Date.now(), sets };
  return sets;
}

/** The same, by id. */
export async function englishSetIndex(): Promise<Map<string, CatalogueSet>> {
  const out = new Map<string, CatalogueSet>();
  for (const s of await englishSets()) out.set(s.id, s);
  return out;
}

/** Thrown away between tests, and by anything that wants the next shelf to re-read the index. */
export const forgetEnglishSets = () => {
  english = null;
  pocketSets = new Set();
};

/**
 * The TCGdex id behind whatever id a client sent: TCGdex's own, the same one
 * in another case, or pokemontcg.io's from before 2026-09-11, through the
 * table. Null where nothing carries it.
 *
 * With the index unreachable the id is taken as given: the set's own record is
 * a separate read, and a GraphQL outage should cost a set page its era and its
 * facts, not the page.
 */
export async function resolveEnglishSetId(setId: string): Promise<string | null> {
  const index = await englishSetIndex().catch(() => null);
  if (!index) return setId;
  if (index.has(setId)) return setId;
  const lower = setId.toLowerCase();
  const mapped = (PTCG_SET_IDS as Record<string, string>)[lower];
  if (mapped && index.has(mapped)) return mapped;
  for (const id of index.keys()) if (id.toLowerCase() === lower) return id;
  return null;
}

/**
 * Rarity and types for a whole set, by id, in one call.
 *
 * `id` is a contains-filter on TCGdex's side, so `sv03` would also answer
 * `sv03.5`'s cards; the prefix check keeps the set's own. Fails soft: a card
 * without facts keeps rarity null and types empty, which is what the other
 * shelves have always shown, and a set is worth showing without them.
 */
async function englishFacts(
  setId: string,
): Promise<Map<string, { rarity: string | null; types: string[] }>> {
  const out = new Map<string, { rarity: string | null; types: string[] }>();
  try {
    const body = (await graphql(
      `{ cards(filters: { id: ${JSON.stringify(setId)} }, pagination: { page: 1, itemsPerPage: 500 }) { id rarity types } }`,
      `en set ${setId} facts`,
    )) as {
      cards?: ({ id: string; rarity?: string | null; types?: string[] | null } | null)[];
    } | null;
    for (const c of body?.cards ?? [])
      if (c?.id.startsWith(`${setId}-`))
        out.set(c.id, { rarity: c.rarity ?? null, types: c.types ?? [] });
  } catch (err) {
    console.error(`TCGdex facts for ${setId} unavailable, set shown without them:`, err);
  }
  return out;
}

/**
 * The number a card is filed under, split so it can be ordered the way a binder
 * page is rather than the way a string sort is: a set's numbers are not all
 * numbers — 151 runs 1–207, Silver Tempest's gallery runs TG01–TG30, and the
 * promos run SVP001 — so the prefix decides the group and the digits the place.
 */
function numberOrder(number: string): [string, number, string] {
  const m = /^([A-Za-z]*)0*(\d+)(.*)$/.exec(number.trim());
  if (!m) return [number.toUpperCase(), Number.MAX_SAFE_INTEGER, number];
  return [(m[1] ?? "").toUpperCase(), Number(m[2]), m[3] ?? ""];
}

export const inBinderOrder = (cards: CatalogueMatch[]): CatalogueMatch[] =>
  [...cards].sort((a, b) => {
    const [ap, an, ar] = numberOrder(a.number);
    const [bp, bn, br] = numberOrder(b.number);
    return ap.localeCompare(bp) || an - bn || ar.localeCompare(br);
  });

/**
 * One English set with every card, in binder order, or null where no id —
 * TCGdex's or pokemontcg.io's — carries it. The whole set rather than a page,
 * because the route wants an exact total and an exact owned count, and the
 * set's record is one cached GET shared by everybody.
 */
export async function englishSet(
  setId: string,
): Promise<{ set: CatalogueSet; cards: CatalogueMatch[] } | null> {
  const id = await resolveEnglishSetId(setId);
  if (!id) return null;
  let detail: TcgSetDetail;
  try {
    detail = (await json(
      `${HOST}/en/sets/${encodeURIComponent(id)}`,
      `en set ${id}`,
    )) as TcgSetDetail;
  } catch (err) {
    if (err instanceof CatalogueNotFound) return null;
    throw err;
  }
  const [index, facts] = await Promise.all([
    englishSetIndex().catch(() => new Map<string, CatalogueSet>()),
    englishFacts(id),
  ]);
  const known = index.get(id);
  const serieId = detail.serie?.id ?? "";
  const set: CatalogueSet = {
    id,
    name: detail.name || known?.name || id,
    localName: null,
    series: known?.series ?? detail.serie?.name ?? "Other",
    releaseDate: shelfDate(detail.releaseDate) ?? known?.releaseDate ?? null,
    total: detail.cardCount?.total ?? detail.cards?.length ?? 0,
    printedTotal: detail.cardCount?.official ?? null,
    cardsRecorded: (detail.cards ?? []).length > 0,
    logo: detail.logo ? `${detail.logo}.webp` : (known?.logo ?? null),
    symbol: detail.symbol ? `${detail.symbol}.webp` : (known?.symbol ?? null),
  };
  const cards = (detail.cards ?? []).map((c): CatalogueMatch => ({
    id: c.id,
    number: c.localId,
    name: c.name,
    localName: null,
    setName: set.name,
    series: set.series,
    // The address is built, as the other shelves build it: the record often says nothing
    // about a scan that is there all the same. A card the assets do not have draws as its name.
    image: serieId ? scan("en", serieId, id, c.localId, "low") : null,
    imageHigh: serieId ? scan("en", serieId, id, c.localId, "high") : null,
    rarity: facts.get(c.id)?.rarity ?? null,
    types: facts.get(c.id)?.types ?? [],
    // TCGdex's id, because this is TCGdex: what every price in this repo is keyed by.
    tcgId: c.id,
  }));
  return { set, cards: inBinderOrder(cards) };
}
