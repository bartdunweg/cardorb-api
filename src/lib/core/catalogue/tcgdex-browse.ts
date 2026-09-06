import { json } from "./tcgdex-client";
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
 */
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
        name: s.name,
        series: serie.name,
        releaseDate: null,
        total: s.cardCount?.total ?? 0,
        printedTotal: s.cardCount?.official ?? null,
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
    name: detail.name,
    series: detail.serie?.name ?? "",
    releaseDate: detail.releaseDate ? detail.releaseDate.replaceAll("-", "/") : null,
    total: detail.cardCount?.total ?? detail.cards?.length ?? 0,
    printedTotal: detail.cardCount?.official ?? null,
    logo: detail.logo ? `${detail.logo}.png` : null,
    symbol: detail.symbol ? `${detail.symbol}.png` : null,
  };
  const cards: CatalogueMatch[] = (detail.cards ?? []).map((c) => ({
    id: c.id,
    number: c.localId,
    name: c.name,
    setName: detail.name,
    image: serieId ? scan(lang, serieId, detail.id, c.localId, "low") : null,
    imageHigh: serieId ? scan(lang, serieId, detail.id, c.localId, "high") : null,
    rarity: null,
    types: [],
    series: detail.serie?.name ?? null,
  }));
  return { set, cards };
}
