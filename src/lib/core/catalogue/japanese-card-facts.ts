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
  cardId?: string,
): string {
  const written = printedStyleName(setId, scrydexNameIsFuller(name, scrydex) ? scrydex! : name);
  const fix = cardId ? JAPANESE_NAME_CORRECTIONS[cardId] : undefined;
  return fix && written === fix[0] ? fix[1] : written;
}

/**
 * Japanese cards whose English name the rules write wrong, read by hand in the naming pass against
 * Bulbapedia's set lists (2026-09-15). Each is [what the copy writes, what the card is], and applies
 * only while the copy still writes the first, so a source that corrects itself wins.
 *
 * - Where the English game printed the card: its English name, as Bulbapedia's Japanese list writes
 *   it too (Max Rod is sv08.5-116, Emcee's Hype sv10-163, Grimsley's Move me02-090, Anthea &
 *   Concordia me02.5-182, Adversity Policy me04-074). TCGplayer and Scrydex translate the Japanese.
 * - Names TCGdex left in Japanese or half-translated, in English where Bulbapedia and a second source
 *   agree: the vintage Clefairy Doll and Mysterious Fossil (the English Base Set and Fossil cards of
 *   the same name), VS's Bugsy's Technical Machines, e-Card's Mystery Plates and Miracle Spheres by
 *   their Greek letter (TCGdex's "b", "o", "y" are β, δ, γ; the English Skyridge cards print them).
 * - Names TCGdex has wrong where Scrydex and Bulbapedia agree: Tag All Stars' 184 and 217 are
 *   Melmetal-GX (TCGplayer too), Mirage Forest's 064 plain Spinda (TCGplayer too), Primal Clash's
 *   and Cruel Traitor's Nidoran their ♀ and ♂, Peerless Fighters' Fighting Energy, Premium Champion
 *   Pack's 139 Metal Energy (Scrydex's own Japanese name 基本鋼エネルギー, where its English one says
 *   Colorless), the Stellar Ceruledge deck's Switch (ポケモンいれかえ).
 * - Gold, Silver, to a New World's Ecogym with its capital, as Scrydex, TCGplayer and Bulbapedia write it.
 * - Crossing the Ruins' 057 is the second Ruin Wall (遺跡の石版, the Aerodactyl carving beside 054's
 *   Kabuto), which TCGdex named by machine translation; TCGplayer sells both as Ruin Wall.
 * - One card written two ways: Expansion Pack's Impostor Professor Oak as the English Base Set card
 *   (base1-73), Challenge from the Darkness' _____'s Chansey with the underscores of _____'s Pikachu.
 */
export const JAPANESE_NAME_CORRECTIONS: Readonly<Record<string, readonly [string, string]>> = {
  "CP4-139": ["Colorless Energy", "Metal Energy"],
  "E4-084": ["ミステリープレートb", "Mystery Plate β"],
  "E4-086": ["ミステリープレートo", "Mystery Plate δ"],
  "E5-082": ["奇跡の球体b", "Miracle Sphere β"],
  "E5-083": ["奇跡の球体y", "Miracle Sphere γ"],
  "M-P-049": ["Struggle Policy", "Adversity Policy"],
  "M2-076": ["Grimsley's One Move", "Grimsley's Move"],
  "M2-105": ["Grimsley's One Move", "Grimsley's Move"],
  "M2a-173": ["Anthea and Concordia", "Anthea & Concordia"],
  "M2a-221": ["Anthea and Concordia", "Anthea & Concordia"],
  "neo1-086": ["ecogym", "Ecogym"],
  "neo2-057": ["壁を台無しにする[aerodactyl]", "Ruin Wall"],
  "PCG5-064": ["Fan Spinda", "Spinda"],
  "PMCG1-089": ["Imposter Professor Oak", "Impostor Professor Oak"],
  "PMCG1-091": ["ピッピ人形", "Clefairy Doll"],
  "PMCG3-046": ["なにかの化石", "Mysterious Fossil"],
  "PMCG6-075": ["_'s Chansey", "_____'s Chansey"],
  "S5a-096": ["Basic Fighting Energy", "Fighting Energy"],
  "SM12a-184": ["Lucario & Melmetal-GX", "Melmetal-GX"],
  "SM12a-217": ["Lucario & Melmetal-GX", "Melmetal-GX"],
  "SV8a-142": ["Fishing Rod MAX", "Max Rod"],
  "SV9a-061": ["Emcee's Excitement", "Emcee's Hype"],
  "SV9a-082": ["Emcee's Excitement", "Emcee's Hype"],
  "SVLS-017": ["ポケモンいれかえ", "Switch"],
  "VS1-105": ["Bugsyのテクニカルマシン01", "Bugsy's Technical Machine 01"],
  "VS1-106": ["Bugsyのテクニカルマシン02", "Bugsy's Technical Machine 02"],
  "XY11b-020": ["Nidoran", "Nidoran♂"],
  "XY5a-025": ["Nidoran", "Nidoran♀"],
};

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
