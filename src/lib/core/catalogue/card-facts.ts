/**
 * What a form needs to know about many cards at once, out of the copy, for a page of tiles.
 *
 * Bart, 2026-09-15: opening a card's sheet must show the choices it offers at once, not half a
 * second later. The sheet learned them from GET /v1/cards/{tcgId}, one card per open, so a client
 * that has a set page on screen asks for the whole page here in one request and has every answer
 * before anybody opens a card.
 *
 * The same facts that route answers, read the same way (card-sheet.ts, card-printings.ts), minus
 * what costs a read per card and no form reads: the price, and the price of each pattern print.
 * A card whose sheet cannot answer everything the route would is null, never a guess: the copy
 * does not hold it, or holds it without the languages or the era the route would ask TCGdex for.
 * The client asks the route for those, as it did for every card before.
 */
import type { Edition, FoilPattern, Finish } from "../collection/collection-row";
import type { CatalogueCardSheet, CatalogueLanguage } from "@/lib/storage/postgres";
import { catalogueCardSheets, printPicturesOfCards } from "@/lib/storage/postgres";
import { adminClient } from "@/lib/storage/supabase";
import { detailFromSheet, languagesFromSheet } from "./card-sheet";
import { type Printing, foilPatternsOfSerie, patternPrintsFor } from "./card-printings";
import { withPrintPictures, withProvenPrintings } from "./print-pictures";

/** The most ids one request may name: a set page's grid, or a page of the collection. */
export const FACTS_BATCH_MAX = 250;

export type FactsRequest = { kind: "invalid"; error: string } | { kind: "ok"; ids: string[] };

/** The ids a request names, each once, in the order asked. */
export function validateFactsIds(value: unknown): FactsRequest {
  if (!Array.isArray(value) || value.length === 0)
    return { kind: "invalid", error: "ids must be a list of at least one card id." };
  if (value.length > FACTS_BATCH_MAX)
    return { kind: "invalid", error: `ids may name at most ${FACTS_BATCH_MAX} cards.` };
  if (
    !value.every((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 64)
  )
    return { kind: "invalid", error: "Every id must be a card id." };
  return { kind: "ok", ids: [...new Set(value)] };
}

/** One card's facts as the batch answers them. */
export type CardFacts = {
  id: string;
  rarity: string | null;
  illustrator: string | null;
  hp: number | null;
  stage: string | null;
  evolveFrom: string | null;
  regulationMark: string | null;
  firstEdition: boolean | null;
  /** Each with its own picture where the store holds one (print-pictures.ts), as the route answers it. */
  printings: (Printing & { image?: string | null })[];
  editions: Edition[] | null;
  languages: string[];
  foilPatterns: FoilPattern[] | null;
  /** As GET /v1/cards/{tcgId} answers it, without each print's price. */
  patternPrints: {
    standard: boolean;
    prints: {
      foilPattern: FoilPattern;
      finish: Finish;
      tcgplayerId: number;
      image?: string | null;
    }[];
  } | null;
};

/** One sheet's facts, or null where the route would have to ask TCGdex for part of them. */
export function factsFromSheet(
  sheet: CatalogueCardSheet,
  language: CatalogueLanguage,
): CardFacts | null {
  const english = language === "en";
  /* English only, as the route: a Japanese card's copy can only be its own language, it has no era
     rule, and the pattern products are on the English shelf. */
  const languages = english ? languagesFromSheet(sheet) : [];
  const serie = sheet.set?.serie_id ?? null;
  if (languages == null || (english && !serie)) return null;
  const detail = detailFromSheet(sheet, language);
  return {
    id: detail.id,
    rarity: detail.rarity,
    illustrator: detail.illustrator,
    hp: detail.hp,
    stage: detail.stage,
    evolveFrom: detail.evolveFrom,
    regulationMark: detail.regulationMark,
    firstEdition: detail.firstEdition,
    printings: detail.printings,
    editions: detail.editions,
    languages,
    foilPatterns: english ? foilPatternsOfSerie(serie) : null,
    patternPrints: english ? unpricedPatternPrints(detail.id) : null,
  };
}

/** The pattern prints as pricePatternPrints lists them (one per finish and pattern), unpriced. */
function unpricedPatternPrints(tcgId: string): CardFacts["patternPrints"] {
  const patterns = patternPrintsFor(tcgId);
  if (!patterns) return null;
  const out = new Map<string, { foilPattern: FoilPattern; finish: Finish; tcgplayerId: number }>();
  for (const p of patterns.prints) {
    const key = `${p.finish}|${p.foilPattern}`;
    if (!out.has(key))
      out.set(key, { foilPattern: p.foilPattern, finish: p.finish, tcgplayerId: p.productId });
  }
  return { standard: patterns.standard, prints: [...out.values()] };
}

/**
 * The facts of every id asked, null for each the copy cannot answer. Throws where the store would
 * not answer, so the route can say so rather than call every card unknown.
 */
export async function cardFactsOf(
  ids: string[],
  language: CatalogueLanguage,
): Promise<Record<string, CardFacts | null>> {
  const db = adminClient();
  const [sheets, pictures] = db
    ? await Promise.all([
        catalogueCardSheets(db, ids, language),
        /* The printings' own pictures (cardorb-api#501), one query for the page. A store that will not
           give them costs the pictures, not the facts: the card's scan stands for each printing. */
        printPicturesOfCards(db, language, ids).catch((err) => {
          console.error("The printings' pictures of a page could not be read:", err);
          return new Map<string, Map<string, string | null>>();
        }),
      ])
    : [new Map(), new Map<string, Map<string, string | null>>()];
  return Object.fromEntries(
    ids.map((id) => {
      const sheet = sheets.get(id);
      const facts = sheet ? factsFromSheet(sheet, language) : null;
      if (!facts) return [id, null];
      const own = pictures.get(id) ?? new Map<string, string | null>();
      return [
        id,
        {
          ...facts,
          printings:
            withPrintPictures(
              language === "ja" ? withProvenPrintings(facts.printings, own) : facts.printings,
              own,
            ) ?? [],
          patternPrints: facts.patternPrints
            ? {
                ...facts.patternPrints,
                prints: withPrintPictures(facts.patternPrints.prints, own) ?? [],
              }
            : null,
        },
      ];
    }),
  );
}
