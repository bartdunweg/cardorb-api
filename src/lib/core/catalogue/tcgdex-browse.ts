import IDS_JA from "../cardmarket-ids.ja.generated.json";
import IDS_KO from "../cardmarket-ids.ko.generated.json";
import IDS_ZH_CN from "../cardmarket-ids.zh-cn.generated.json";
import IDS_ZH_TW from "../cardmarket-ids.zh-tw.generated.json";
import { json } from "./tcgdex-client";
import JA_NAMES from "./set-names.ja.json";
import ZH_NAMES from "./set-names.zh.json";
import ZH_CN_NAMES from "./set-names.zh-cn.json";
import type { CatalogueSet } from "./ptcg-browse";
import type { CatalogueMatch } from "./ptcg-search";

/**
 * The shelf and the set pages for a language other than English.
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
        series: serie.name,
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
    series: detail.serie?.name ?? "",
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
    name: c.name,
    setName: set.name,
    image: serieId ? scan(lang, serieId, detail.id, c.localId, "low") : null,
    imageHigh: serieId ? scan(lang, serieId, detail.id, c.localId, "high") : null,
    rarity: null,
    types: [],
    series: detail.serie?.name ?? null,
  }));
  return { set, cards };
}
