import { correctedFacts } from "./card-fact-corrections";

/**
 * One spelling for each English rarity.
 *
 * TCGdex writes the Scarlet & Violet rarities in sentence case ("Double rare", "Illustration rare")
 * and the older ones in title case ("Double Rare" never, "Holo Rare" always), and one word order
 * for a holo in some eras ("Rare Holo") and the other in the rest ("Holo Rare"). A filter, a
 * facet or a count keyed by the word then shows the same rarity twice. On 2026-09-14 Bart chose
 * TCGplayer's spelling, which is title case and "Holo Rare" throughout.
 *
 * Keyed lower-case, so a spelling already right passes through, and a word not listed is left as
 * the catalogue has it. The stored rows (cards.rarity, a binder's rule and Pokédex setting) were
 * moved to the same words by migration 20260914200000.
 */
export const RARITY_SPELLING: Readonly<Record<string, string>> = {
  "double rare": "Double Rare",
  "illustration rare": "Illustration Rare",
  "special illustration rare": "Special Illustration Rare",
  "hyper rare": "Hyper Rare",
  "shiny rare": "Shiny Rare",
  "shiny rare v": "Shiny Rare V",
  "shiny rare vmax": "Shiny Rare VMAX",
  "rare holo": "Holo Rare",
  "rare holo lv.x": "Holo Rare LV.X",
};

/** A rarity in the one spelling, or the word as given where it has no other. */
export function canonicalRarity(rarity: string | null | undefined): string | null {
  if (rarity == null) return null;
  return RARITY_SPELLING[rarity.trim().toLowerCase()] ?? rarity;
}

/** An English card's rarity as shown: its correction (card-fact-corrections.ts), then the spelling. */
export function englishRarity(id: string, rarity: string | null | undefined): string | null {
  return canonicalRarity(correctedFacts(id, { rarity: rarity ?? null, types: [] }).rarity);
}
