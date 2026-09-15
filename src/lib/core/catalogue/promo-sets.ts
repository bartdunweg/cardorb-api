/**
 * The promo sets, whose every card is a "Promo".
 *
 * A promo prints a black star where another card prints its rarity symbol, so "Promo" is what the
 * card itself says. From 2026-09-12 the owner named each promo's kind by hand instead (Illustration
 * Rare, Ultra Rare, read off the art), and the catalogues' "Promo" was dropped to make room for
 * that. Read off the art turned out not to be reliable, and no source publishes a promo's kind, so
 * on 2026-09-15 Bart decided it the other way for good: every card in a promo set is a "Promo", in
 * every language's copy and in every collection row, and nobody sets a rarity by hand.
 *
 * TCGdex's set ids. These are exactly the sets in the copy whose name says promo (checked live on
 * 2026-09-15); the data health run holds the copy to that, so a new promo set that is not added
 * here is a failed check rather than a quiet gap. The McDonald's sets, Best of Game and the rest
 * that card-fact-corrections.ts calls "Promo" card by card are not promo sets and are not listed.
 */
export const PROMO_SETS: readonly string[] = [
  // English: Wizards, Nintendo, Diamond & Pearl, HeartGold & SoulSilver, Black & White, XY, Sun &
  // Moon, Sword & Shield, Scarlet & Violet, Mega Evolution, the miscellaneous and the WotC promos.
  "basep",
  "np",
  "dpp",
  "hgssp",
  "bwp",
  "xyp",
  "smp",
  "swshp",
  "svp",
  "mep",
  "miscp",
  "wp",
  // Japanese: Mega and Scarlet & Violet.
  "M-P",
  "SV-P",
];

const PROMO = new Set(PROMO_SETS);

/** True for a TCGdex set id in PROMO_SETS. Case matters: the Japanese ids are upper case. */
export const isPromoSet = (setId: string | null | undefined): boolean =>
  !!setId && PROMO.has(setId);

/**
 * A card's rarity, "Promo" where its id is in a promo set and the rarity given everywhere else.
 *
 * The set is everything before the last dash, as setIdOf() in tcgdex-language.ts reads it, because
 * a Japanese promo set's id holds a dash of its own: SV-P-051 is in SV-P, not in SV.
 */
export function promoRarity(
  tcgId: string | null | undefined,
  rarity: string | null,
): string | null {
  if (!tcgId) return rarity;
  const cut = tcgId.lastIndexOf("-");
  return cut > 0 && isPromoSet(tcgId.slice(0, cut)) ? "Promo" : rarity;
}
