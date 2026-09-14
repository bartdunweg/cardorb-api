/**
 * A Japanese card's facts as the copy writes them: its rarity as the card prints it, and what Scrydex
 * knows where TCGdex does not (scrydex-cards.ja.generated.json, scripts/scrydex-japan-cards.mjs).
 *
 * The rarity rules are in rarity-names.ts (japaneseRarity).
 */
import SCRYDEX from "../scrydex-cards.ja.generated.json";
import SPECIES from "../pokedex.generated.json";
import LOCAL_SPECIES from "../species-names.generated.json";
import { isMachineNamedSet, printedStyleName } from "./english-card-name.mjs";
import { japaneseRarity, japaneseRarityWord } from "./rarity-names";

export { japaneseRarity, japaneseRarityWord };

/** One card as the committed map keeps it; see scripts/scrydex-japan-cards.mjs. */
export type ScrydexCard = {
  /** Scrydex's English name, as the English game prints such a card ("M Houndoom-EX"). */
  n?: string;
  /** The printed Japanese name. */
  j?: string;
  /** The rarity mark as Scrydex writes it: "SAR", "●", "none" where the card prints none. */
  m?: string;
  /** The artist. */
  a?: string;
  /** The Pokémon it evolves from, in English. */
  e?: string;
  /** Only on a card TCGdex does not list (`x`): printed number, category, stage, trainer type, types, HP. */
  p?: string;
  c?: string;
  s?: string;
  tt?: string;
  t?: string[];
  h?: number;
  x?: 1;
};

const MAP = SCRYDEX as unknown as {
  cards: Record<string, ScrydexCard>;
  sets: Record<string, { code: string; cards: number }>;
};

/** What Scrydex knows about one card of the copy, or null. */
export const scrydexCard = (id: string): ScrydexCard | null => MAP.cards[id] ?? null;

/** The cards of a set Scrydex lists and TCGdex does not, by the id the copy files them under. */
export const scrydexOnlyCards = (setId: string): [string, ScrydexCard][] =>
  Object.entries(MAP.cards).filter(([id, c]) => c.x && id.slice(0, id.lastIndexOf("-")) === setId);

/** The Scrydex expansion code a set was read from, for its scans. */
export const scrydexCodeOf = (setId: string): string | null => MAP.sets[setId]?.code ?? null;

/** How many cards a set prints, as Scrydex lists them: what data-health holds the copy to. */
export const expectedCardCount = (setId: string): number | null => MAP.sets[setId]?.cards ?? null;

/** TCGdex writes a Japanese stage both ways ("Stage1" 3,154 times, "Stage 1" 959); the copy one. */
export const japaneseStage = (stage: string | null | undefined): string | null =>
  stage ? stage.replace(/^Stage (\d)$/, "Stage$1") : null;

/**
 * Whether Scrydex's English name is the fuller one: it holds every word the copy's name has, and
 * more ("Light Arcanine" for "Arcanine", "M Mewtwo-EX" for "Mewtwo", "Brock's Sandshrew" for
 * "Sandshrew"), the same words with the accents the copy lost ("Flabébé"), or the copy's name is
 * still Japanese text (粉末を癒します for Heal Powder).
 */
export function scrydexNameIsFuller(ours: string, scrydex: string | null | undefined): boolean {
  if (!scrydex || !/[A-Za-z]/.test(scrydex)) return false;
  if (!/[A-Za-z]/.test(ours) || /[぀-ヿ一-鿿]/.test(ours)) return true;
  const words = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/-(?=ex|gx)/g, " ")
      .split(/[\s&]+/)
      .map((w) => w.replace(/[^a-z0-9☆δ◇?!]/g, ""))
      .filter(Boolean);
  const theirs = words(scrydex);
  const mine = words(ours);
  if (!mine.every((w) => theirs.includes(w))) return false;
  if (theirs.length > mine.length) return true;
  // The same words, where Scrydex keeps the accent the copy lost: "Flabébé" for "Flabebe" (XY8a).
  const accents = (x: string) => x.normalize("NFD").replace(/[^\u0300-\u036f]/g, "").length;
  return theirs.length === mine.length && accents(scrydex) > accents(ours);
}

/**
 * A Japanese card's English name as the copy writes it: Scrydex's where it is the fuller one
 * (scrydexNameIsFuller), in the English game's printed style (printedStyleName).
 */
export function japaneseCardName(
  setId: string,
  name: string,
  scrydex: string | null | undefined,
): string {
  return printedStyleName(setId, scrydexNameIsFuller(name, scrydex) ? scrydex! : name);
}

/**
 * The name the card prints, beside its English one: TCGdex's, or Scrydex's where TCGdex has none
 * (5,518 cards on 2026-09-14) and for the sets TCGdex named through a machine translation.
 */
export function japaneseLocalName(
  setId: string,
  tcgdex: string | null,
  scrydex: string | null | undefined,
): string | null {
  if (scrydex && (isMachineNamedSet(setId) || !tcgdex)) return scrydex;
  return tcgdex;
}

const LOCAL_TO_ENGLISH = new Map(
  (LOCAL_SPECIES as ({ ja?: string } | null)[])
    .map((row, i): [string, string | undefined] => [row?.ja ?? "", (SPECIES as string[])[i]])
    .filter((pair): pair is [string, string] => !!pair[0] && !!pair[1]),
);

/**
 * An evolution TCGdex wrote in Japanese, in English where it is exactly one species' name (リザード
 * is Charmeleon); as written otherwise.
 */
export function englishEvolveFrom(evolveFrom: string | null | undefined): string | null {
  if (!evolveFrom) return null;
  return LOCAL_TO_ENGLISH.get(evolveFrom.normalize("NFKC").trim()) ?? evolveFrom;
}
