/**
 * TCGplayer's rarity words that say more than a plain Rare or no printed mark on a Japanese card, apart
 * from rarity-names.ts so the morning check (scripts/data-health.mjs) reads the same list.
 *
 * Scrydex reads Shiny Star V's and GX Ultra Shiny's S as R, the LEGEND era's holos as R, and records
 * no mark on Radiant, Trainer Rare and Amazing Rare cards that print one, and on MEGA Dream ex's Mega
 * Attack Rares (M2a-232 Mega Dragonite ex prints MA; 2026-09-17).
 *
 * Plain JavaScript, because the script runs on plain node and cannot import TypeScript.
 */
export const SAYS_MORE = new Set([
  "Shiny Rare",
  "Holo Rare",
  "Super Rare Holo",
  "Trainer Rare",
  "Radiant Rare",
  "Amazing Rare",
  "Character Super Rare",
  "Mega Attack Rare",
]);

/**
 * TCGplayer's words for a Japanese card that are no rarity at all, and never fill one.
 *
 * Bart decided it on 2026-09-17: a Japanese card that prints no mark stays without a rarity, whatever
 * TCGplayer files it under. Its Japanese shelf gives every product a word, and where the card prints
 * nothing it writes its own default: "Common" on 843 cards and "None" on 1,328 (data-health,
 * 2026-09-17). Neither is read off a card, so neither is evidence of a mark. The words that do say
 * more than no mark are in SAYS_MORE above, and those still fill one.
 *
 * Declared here rather than left to each reader, so a rule written next month cannot quietly fill
 * 843 cards with a rarity nobody printed (consensus.mjs declares the same as an exception: TCGplayer
 * does not vote on a Japanese card's rarity).
 */
export const NEVER_FILLS = new Set(["Common", "None", "Unconfirmed"]);
