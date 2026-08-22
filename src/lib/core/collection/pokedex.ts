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
 * Which Pokémon a card is of, or null for the trainers and the energy.
 *
 * Substring rather than equality, because the species name is almost never the
 * whole card name. Longest first, because most of the short names sit inside a
 * longer one: Mew in Mewtwo, Aron in Lairon, Porygon in Porygon2.
 */
export function speciesOf(cardName: string): number | null {
  const key = normalise(cardName);
  if (!key) return null;
  return BY_LENGTH.find((s) => key.includes(s.key))?.id ?? null;
}

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
