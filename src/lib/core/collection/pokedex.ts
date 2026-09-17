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

import LOCAL_NAMES from "../species-names.generated.json";
import type { BrowseLanguage } from "../catalogue/tcgdex-browse";

/** One row of the generated table: a species' name in each catalogue that is not English. */
type LocalNames = { ja?: string };
import SPECIES from "../pokedex.generated.json";
import {
  fillsPokedexSlot,
  nameParts,
  normalise,
  normaliseLocal,
  speciesInKey,
  speciesIndex,
} from "../species-match.mjs";

export { normalise } from "../species-match.mjs";

/** Every species, longest name first, so the longest match is the first hit. */
const BY_LENGTH = speciesIndex(SPECIES, normalise);

/** Which column of the generated table a catalogue reads. */
const COLUMN: Record<BrowseLanguage, keyof LocalNames> = {
  ja: "ja",
};

/** Per catalogue, its species longest name first, for the same longest-match rule. */
const LOCAL_BY_LENGTH = new Map<BrowseLanguage, { id: number; key: string }[]>();
function localIndex(catalogue: BrowseLanguage) {
  const had = LOCAL_BY_LENGTH.get(catalogue);
  if (had) return had;
  const column = COLUMN[catalogue];
  const built = speciesIndex(
    (LOCAL_NAMES as LocalNames[]).map((row) => row[column]),
    normaliseLocal,
  );
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
    const found = speciesInKey(key, localIndex(catalogue));
    if (SPECIES_OF.size < 20_000) SPECIES_OF.set(`${catalogue}:${key}`, found);
    return found;
  }
  const key = normalise(cardName);
  if (!key) return null;
  const known = SPECIES_OF.get(key);
  if (known !== undefined) return known;
  const id = speciesInKey(key, BY_LENGTH);
  // A collection names the same card many times over (its printings, its copies, every
  // request): the scan down a thousand names runs once per distinct name per instance.
  if (SPECIES_OF.size < 20_000) SPECIES_OF.set(key, id);
  return id;
}

const SPECIES_OF = new Map<string, number | null>();

/**
 * Every Pokémon a card is of: one for most cards, two or three for a tag team.
 *
 * "Pikachu & Zekrom-GX" is a card of Pikachu and of Zekrom, and a Pokédex binder that files it
 * under one of them leaves the other grey while the card sits in the binder. The longest-match
 * rule above answers one species for the whole name, so the name is split on its ampersand
 * (full-width on the Japanese shelf) and each part asked on its own. The whole name's answer
 * leads, so `speciesId` and the first of these always agree. A part naming no species (a
 * trainer's half) adds nothing.
 */
export function speciesAllOf(cardName: string, catalogue?: BrowseLanguage | null): number[] {
  const whole = speciesOf(cardName, catalogue);
  const parts = nameParts(cardName);
  const ids = parts.length > 1 ? parts.map((part) => speciesOf(part, catalogue)) : [];
  return [...new Set([whole, ...ids].filter((id): id is number => id !== null))];
}

export const speciesList = (origin: string): { id: number; name: string; artwork_url: string }[] =>
  SPECIES.map((name, i) => ({
    id: i + 1,
    name,
    artwork_url: `${origin}/artwork/pokedex/${i + 1}.png`,
  }));

/**
 * The Pokémon a card fills a slot for: speciesAllOf for a Pokémon card, none for a trainer or an
 * Energy that happens to hold a species' name ("Aaron's Collection", "Clefairy Doll"). A card whose
 * category is not known keeps its name match (fillsPokedexSlot).
 */
export function slotSpeciesOf(
  cardName: string,
  category: string | null | undefined,
  catalogue?: BrowseLanguage | null,
): { speciesId: number | null; speciesIds: number[] } {
  if (!fillsPokedexSlot(category)) return { speciesId: null, speciesIds: [] };
  return {
    speciesId: speciesOf(cardName, catalogue),
    speciesIds: speciesAllOf(cardName, catalogue),
  };
}
