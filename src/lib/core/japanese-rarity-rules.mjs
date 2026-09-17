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
