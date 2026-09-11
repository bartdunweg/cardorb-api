/**
 * The collection, read as a Pokédex: every Pokémon there is, and which of them
 * the binder can show you.
 *
 * The hard part is not the list, it is the names. A card is not called
 * "Charizard", it is called "Charizard ex", "Mega Charizard X", "Dark
 * Charizard" or "Team Rocket's Charizard, and the set of things that can be
 * bolted onto a species name is open-ended: every era invents a couple more.
 *
 * So this does not try to strip them. It asks the opposite question, which
 * species name is inside this card's name, and takes the longest answer, which
 * is what makes "Mewtwo" win over the "Mew" sitting inside it. That rule needs
 * no list of suffixes and does not go stale in three years.
 *
 * Pure, and separate from the component, because the matching is the part worth
 * testing: a Pokédex that quietly files Mewtwo under Mew is wrong in a way
 * nobody notices by looking at it.
 */

import { shownPrice } from "./cards";
import LOCAL_NAMES from "../species-names.generated.json";
import type { BrowseLanguage } from "../catalogue/tcgdex-browse";

/** One row of the generated table: a species' name in each catalogue that is not English. */
type LocalNames = { ja?: string; ko?: string; zhHant?: string; zhHans?: string };
import type { CardSet, OwnedCard } from "./cards";
import SPECIES from "../pokedex.generated.json";

export type DexEntry = {
  /** National Dex number. */
  id: number;
  name: string;
  /** The cards in the collection that show this Pokémon, held or wanted. */
  cards: OwnedCard[];
  /** How many of those are actually in the binder. */
  owned: number;
};

/**
 * Down to letters and digits.
 *
 * Punctuation is what separates "Mr. Mime" from "Mr Mime" from "Mr.Mime", and
 * TCGdex, Notion and the cards themselves do not agree on which. The gender
 * signs stay, as letters: they are the only thing telling the two Nidoran
 * apart, and dropping them would merge a species with another one.
 */
export function normalise(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/♀/g, "f")
    .replace(/♂/g, "m")
    .replace(/[^a-z0-9]/g, "");
}

/** Every species, longest name first, so the longest match is the first hit. */
const BY_LENGTH = SPECIES.map((name, i) => ({ id: i + 1, name, key: normalise(name) })).sort(
  (a, b) => b.key.length - a.key.length,
);

/**
 * The same question in a language that is not written in this alphabet.
 *
 * `normalise` keeps `[a-z0-9]` and nothing else, which is right for the Latin catalogues and
 * empties a Japanese name completely — so every card off the Japanese, Korean and Chinese
 * shelves landed in no Pokédex slot at all. This keeps any script's letters and digits and drops
 * only what separates them, so ピカチュウex reduces to ピカチュウex and still contains ピカチュウ.
 *
 * NFKC first: a card prints its suffix full-width often enough (ｅｘ), and without folding that
 * the same card is two different strings.
 */
function normaliseLocal(name: string) {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Which column of the generated table a catalogue reads. */
const COLUMN: Record<BrowseLanguage, keyof LocalNames> = {
  ja: "ja",
  ko: "ko",
  "zh-tw": "zhHant",
  "zh-cn": "zhHans",
};

/** Per catalogue, its species longest name first, for the same longest-match rule. */
const LOCAL_BY_LENGTH = new Map<BrowseLanguage, { id: number; key: string }[]>();
function localIndex(catalogue: BrowseLanguage) {
  const had = LOCAL_BY_LENGTH.get(catalogue);
  if (had) return had;
  const column = COLUMN[catalogue];
  const built = LOCAL_NAMES.map((row, i) => ({ id: i + 1, key: normaliseLocal(row[column] ?? "") }))
    .filter((e) => e.key)
    .sort((a, b) => b.key.length - a.key.length);
  LOCAL_BY_LENGTH.set(catalogue, built);
  return built;
}

/**
 * Which Pokémon a card is of, or null for the trainers and the energy.
 *
 * Substring rather than equality, because the species name is almost never the
 * whole card name. Longest first, because most of the short names sit inside a
 * longer one: Mew in Mewtwo, Aron in Lairon, Porygon in Porygon2.
 *
 * `catalogue` is which shelf the card was read from, not what language it is printed in: a
 * German printing of an English-catalogue card is still named in English here.
 */
export function speciesOf(cardName: string, catalogue?: BrowseLanguage | null): number | null {
  if (catalogue) {
    const key = normaliseLocal(cardName);
    if (!key) return null;
    const cached = SPECIES_OF.get(`${catalogue}:${key}`);
    if (cached !== undefined) return cached;
    const found = localIndex(catalogue).find((s) => key.includes(s.key))?.id ?? null;
    if (SPECIES_OF.size < 20_000) SPECIES_OF.set(`${catalogue}:${key}`, found);
    return found;
  }
  const key = normalise(cardName);
  if (!key) return null;
  const known = SPECIES_OF.get(key);
  if (known !== undefined) return known;
  const id = BY_LENGTH.find((s) => key.includes(s.key))?.id ?? null;
  // A collection names the same card many times over (its printings, its copies, every
  // request): the scan down a thousand names runs once per distinct name per instance.
  if (SPECIES_OF.size < 20_000) SPECIES_OF.set(key, id);
  return id;
}

const SPECIES_OF = new Map<string, number | null>();

/**
 * The whole Dex, in order, with the collection filed into it.
 *
 * Every Pokémon is present whether or not there is a card of it: the empty
 * slots are the point of a Pokédex, and a list of only what is held is a list
 * this page already has three of.
 */
export function getPokedex(sets: CardSet[]): DexEntry[] {
  const entries: DexEntry[] = SPECIES.map((name, i) => ({
    id: i + 1,
    name,
    cards: [],
    owned: 0,
  }));

  for (const set of sets) {
    for (const card of set.cards) {
      // The card's own answer, worked out on the server. See speciesId in
      // lib/cards.ts for why this is not speciesOf(card.name) any more.
      const id = card.speciesId;
      if (!id) continue;
      const entry = entries[id - 1];
      // speciesOf only ever answers with an index this array has, but the
      // compiler cannot know that and a silent miss is not worth the risk.
      if (!entry) continue;
      entry.cards.push(card);
      if (card.owned) entry.owned++;
    }
  }

  // The priciest card first inside each Pokémon, so the one the grid shows for
  // it is the best copy in the binder rather than whichever set was read first.
  for (const entry of entries) {
    entry.cards.sort((a, b) => (shownPrice(b.price) ?? 0) - (shownPrice(a.price) ?? 0));
  }
  return entries;
}

/** How many species the collection can show at all. */
export const caught = (dex: DexEntry[]) => dex.filter((e) => e.owned > 0).length;

/**
 * Every species there is, by National Dex number — the names alone, with no
 * collection behind them.
 *
 * getPokedex() answers the same names, but only after a collection has been
 * assembled, which is why a caller who owns nothing and holds no key could not
 * get at them. They are catalogue-level facts: the same 1,025 strings for
 * everyone, so a stranger reading a public profile's Pokédex can label its
 * slots without being told anything about whose profile it is.
 */
export const speciesList = (): { id: number; name: string }[] =>
  SPECIES.map((name, i) => ({ id: i + 1, name }));
