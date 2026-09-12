/**
 * Which cards of a set are full art.
 *
 * A full art card is one whose illustration covers the whole card instead of sitting in a frame
 * (Bulbapedia, "Full Art card (TCG)"). No catalogue records that. TCGdex answers a rarity, and
 * the rarity means a different card in every era, counted on 2026-09-12:
 *
 * - 151 (Scarlet & Violet): "Ultra Rare" is the full art ex, 182 to 197.
 * - Sword & Shield (base): "Ultra Rare" is the full art V, 187 to 202.
 * - Sun & Moon (base): "Ultra Rare" is the *plain* GX, 12 to 149. Not full art at all; that
 *   set's full arts are its Secret Rares, 150 upward.
 * - XY (base): "Ultra Rare" is the plain EX and the full art EX at once, in one rarity.
 *
 * A fixed list of rarities would hand back every plain GX of one era and miss the full arts of
 * another. What holds in every era is that a full art is a *reprint*: the same name appears a
 * second time, later in the set, with the art let out to the edges. So a card of an ambiguous
 * rarity is full art when that name already stood earlier in the set.
 *
 * Gold is not full art: what a gold card gets is "golden borders". At the two ambiguous
 * rarities a Supporter is the full art reprint and an Item, a Tool or a Stadium is the gold
 * one, and the rarity says the same word for both, which is why `trainerType` is carried.
 *
 * The web app keeps its own copy of this rule (cardorb-web, `src/lib/full-art.ts`) for the set
 * page, which works on every language shelf and not only on what the copy holds. The two are to
 * stay in step, the way the folder rules already are.
 */

/** A card as this rule reads it. */
export type FullArtCard = {
  name: string;
  /** The number printed on the card, as the catalogue spells it. */
  number: string;
  rarity: string | null;
  /** "Pokemon", "Trainer" or "Energy"; null where the shelf did not say. */
  category?: string | null;
  /** "Supporter", "Item", "Tool", "Stadium"; null for anything that is not a trainer. */
  trainerType?: string | null;
};

/** Rarities that are full art wherever they appear, so the numbering is never asked. */
const ALWAYS_FULL_ART = new Set([
  "illustration rare",
  "special illustration rare",
  "shiny ultra rare",
  "shiny rare",
  "full art trainer",
  "black white rare",
  "crown",
  "amazing rare",
]);

/**
 * Rarities that hold both a plain card and its full art reprint, decided by the numbering.
 * "Hyper rare" is deliberately absent: that is the gold card.
 */
const REPRINT_RARITIES = new Set(["ultra rare", "secret rare"]);

/** A trainer that is not a Supporter is the gold print at these rarities, never the full art. */
const FULL_ART_TRAINER = "supporter";

const lower = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** A card's number as one number, so "045" and "45" compare alike and a letter does not throw. */
const numberOf = (card: FullArtCard): number => {
  const digits = card.number.replace(/\D/g, "");
  return digits ? Number(digits) : Number.POSITIVE_INFINITY;
};

/**
 * The ids, numbers or whatever `key` returns, of the set's full art cards. Takes the whole set,
 * because the rule is about a card's place in it.
 */
export function fullArtOf<T extends FullArtCard>(cards: T[]): Set<T> {
  const first = new Map<string, number>();
  for (const card of cards) {
    const key = lower(card.name);
    const at = numberOf(card);
    const seen = first.get(key);
    if (seen === undefined || at < seen) first.set(key, at);
  }
  const out = new Set<T>();
  for (const card of cards) {
    const rarity = lower(card.rarity);
    if (ALWAYS_FULL_ART.has(rarity)) {
      out.add(card);
      continue;
    }
    if (!REPRINT_RARITIES.has(rarity)) continue;
    const category = lower(card.category);
    if (category === "energy") continue;
    if (category === "trainer" && card.trainerType && lower(card.trainerType) !== FULL_ART_TRAINER)
      continue;
    if ((first.get(lower(card.name)) ?? Number.POSITIVE_INFINITY) < numberOf(card)) out.add(card);
  }
  return out;
}

/** Whether each card of a set is full art, as a flag per card, in the order given. */
export const fullArtFlags = <T extends FullArtCard>(cards: T[]): boolean[] => {
  const set = fullArtOf(cards);
  return cards.map((c) => set.has(c));
};
