import { SAYS_MORE } from "../japanese-rarity-rules.mjs";

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
  // TCGplayer's Japanese shelf writes the Radiant cards' rarity in Japanese (S10a, S11a, S12a).
  kagayaku: "Radiant Rare",
};

/** A rarity in the one spelling, or the word as given where it has no other. */
export function canonicalRarity(rarity: string | null | undefined): string | null {
  if (rarity == null) return null;
  return RARITY_SPELLING[rarity.trim().toLowerCase()] ?? rarity;
}

// ── A Japanese card's rarity ──────────────────────────────────────────────────

/*
 * Bart, 2026-09-14: a Japanese card's rarity is the mark it prints, written as that mark's English
 * long form, one spelling each: C Common, U Uncommon, R Rare, RR Double Rare, RRR Triple Rare, PR
 * Prism Rare, TR Trainer Rare, SR Super Rare, HR Hyper Rare, UR Ultra Rare, SSR Shiny Super Rare, S
 * Shiny Rare, AR Art Rare, SAR Special Art Rare, CHR Character Rare, CSR Character Super Rare, K
 * Radiant Rare, A Amazing Rare, ACE ACE SPEC Rare, BWR Black White Rare, MUR Mega Ultra Rare, MA Mega
 * Attack Rare. The vintage sets print a symbol: ● Common, ◆ Uncommon, ★ Rare, and a holo ★ is Holo
 * Rare. A card that prints no mark has no rarity: null, never the word "None" (SV4a-190 Luminous
 * Energy, SM2p-049 Olivia).
 *
 * The copy held TCGdex's words, which are the English game's ("Illustration Rare" for an AR, "Ultra
 * Rare" for SM2p-050 Tapu Bulu GX, which prints SR), with TCGplayer's where TCGdex had none, and
 * "None" for 1,670 cards. Measured on 2026-09-14 across the 16,633 cards Scrydex has: Scrydex's mark
 * and TCGplayer's rarity agree on 90.0% of the 16,174 both name; TCGdex agreed with Scrydex on 74.4%
 * and with TCGplayer on 68.6% of a 1,000-card sample. Scrydex is the one that reads the mark, so it
 * leads, and TCGplayer is taken where Scrydex misreads a whole run: Shiny Star V's and GX Ultra
 * Shiny's shiny cards, which print S and Scrydex calls R (149 cards), and a card whose mark Scrydex
 * did not record at all while TCGplayer names a rarity only a mark gives (Trainer Rare, Radiant Rare).
 */
/** Each mark's long form. Null: the card prints no mark. */
export const MARK_RARITY: Readonly<Record<string, string | null>> = {
  C: "Common",
  U: "Uncommon",
  R: "Rare",
  RR: "Double Rare",
  RRR: "Triple Rare",
  PR: "Prism Rare",
  TR: "Trainer Rare",
  SR: "Super Rare",
  HR: "Hyper Rare",
  UR: "Ultra Rare",
  SSR: "Shiny Super Rare",
  S: "Shiny Rare",
  "Shiny Rare": "Shiny Rare",
  A: "Art Rare",
  AR: "Art Rare",
  SAR: "Special Art Rare",
  CHR: "Character Rare",
  CSR: "Character Super Rare",
  K: "Radiant Rare",
  ACE: "ACE SPEC Rare",
  BWR: "Black White Rare",
  MUR: "Mega Ultra Rare",
  MA: "Mega Attack Rare",
  "Mega Attack Rare": "Mega Attack Rare",
  "●": "Common",
  "♦": "Uncommon",
  "◆": "Uncommon",
  "★": "Rare",
  "★H": "Holo Rare",
  "Rare Holo ex": "Holo Rare",
  "Rare Holo Star": "Holo Rare",
  "Rare Holo ☆": "Holo Rare",
  "Rare Secret": "Secret Rare",
  "Secret Rare": "Secret Rare",
  れじぇんど: "LEGEND",
  PROMO: "Promo",
  プロモ: "Promo",
  // Scrydex's dash for a card that prints no mark, as the committed map writes it.
  none: null,
  None: null,
};

/** TCGplayer's and TCGdex's words for the same marks, where they spell them otherwise. */
const OTHER_WORDS: Readonly<Record<string, string | null>> = {
  none: null,
  kagayaku: "Radiant Rare",
  "shiny secret rare": "Shiny Super Rare",
  "shiny ultra rare": "Shiny Super Rare",
  "ace rare": "ACE SPEC Rare",
  "ace spec rare": "ACE SPEC Rare",
  "illustration rare": "Art Rare",
  "special illustration rare": "Special Art Rare",
  "mega hyper rare": "Mega Ultra Rare",
  "rare holo legend": "LEGEND",
  // TCGplayer's word for neo's and Shining Legends' shining cards, which is no mark.
  shining: null,
};

/** A rarity word from TCGplayer or TCGdex in the Japanese spelling; null for none. */
export function japaneseRarityWord(word: string | null | undefined): string | null {
  const trimmed = word?.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  if (key in OTHER_WORDS) return OTHER_WORDS[key] ?? null;
  return canonicalRarity(trimmed);
}

/**
 * A Japanese card's rarity: Scrydex's mark, TCGplayer's word where Scrydex misreads it (see above),
 * and where Scrydex does not have the card, TCGplayer's word, then TCGdex's.
 */
export function japaneseRarity({
  mark,
  tcgplayer,
  tcgdex,
}: {
  mark?: string | null;
  tcgplayer?: string | null;
  tcgdex?: string | null;
}): string | null {
  const product = japaneseRarityWord(tcgplayer);
  if (mark != null && mark in MARK_RARITY) {
    const printed = MARK_RARITY[mark] ?? null;
    if ((printed === "Rare" || printed === null) && product && SAYS_MORE.has(product))
      return product;
    return printed;
  }
  if (mark) return japaneseRarityWord(mark);
  return product ?? japaneseRarityWord(tcgdex);
}
