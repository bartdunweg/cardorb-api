/**
 * A card's printed number: how two spellings of it are compared, and how the catalogue copy writes it.
 *
 * Plain JavaScript, like price-basis.mjs, because scripts/data-health.mjs has to hold the copy and the
 * collection to the same rule the API matches them by, and a script cannot import the API's
 * TypeScript. One rule in one place: the copy sheet, the set page's ownership, the CSV import's count
 * and the morning check all fold a number the same way.
 */

/**
 * The letters a Black Star Promo set writes in front of every one of its numbers, as util.ts's
 * PROMO_PREFIXES lists them (card-number.test.ts fails when the two differ). XY123 is card 123 of the
 * XY promos, which is what the fold below reads it as. What a row stores is the printed number,
 * XY123 (collection/catalogue-spelling.ts), and storedCardNumber() is only the fallback.
 */
export const PROMO_PREFIXES = ["HGSS", "SWSH", "SVP", "XY", "SM", "BW", "DP"];

const PROMO_PREFIX = new RegExp(`^(?:${PROMO_PREFIXES.join("|")})(?=\\d)`, "i");

/**
 * A number folded down to what it means rather than how it was typed or printed.
 *
 * The digits lose their padding ("001", "01" and "1" are one card), case stops mattering ("77a" is
 * 77A), and a promo set's letters come off, because they are the set's and not the card's (SWSH260
 * is the 260 a collector writes). Every other letter keeps its place: TG01 is not card 1, SV49 is not
 * 49, and 60a is not 60. A number with no digits (Unown "?", "ONE") is compared as written, in any case.
 *
 * @param {string | null | undefined} n
 * @returns {string}
 */
export function canonNumber(n) {
  const trimmed = String(n ?? "").trim();
  const bare = trimmed.replace(PROMO_PREFIX, "");
  const m = /^([A-Za-z]*)0*(\d+)(.*)$/.exec(bare);
  if (m) return `${m[1] ?? ""}${Number(m[2])}${m[3] ?? ""}`.toLowerCase();
  // Case only: Unown "?" and "!" are two cards of one set, and a fold that dropped the marks made
  // them one.
  return trimmed.toLowerCase();
}

/**
 * Whether two numbers name the same card of one set, whichever way each is spelt.
 *
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 * @returns {boolean}
 */
export const sameNumber = (a, b) => canonNumber(a) === canonNumber(b);

/**
 * The English sets whose cards print a three-digit number where TCGdex writes it bare ("001/202"
 * where TCGdex has 1), read off Bulbapedia's set lists (scripts/bulbapedia-compare.mjs, "number
 * spelling", 2026-09-15): Sword & Shield through Fusion Strike, Celebrations, Pokémon Futsal 2020,
 * the 2023 and 2024 McDonald's collections and the Nintendo promos. From Brilliant Stars on TCGdex
 * writes the zeros itself, and the sets before Sword & Shield (and the 2021 and 2022 McDonald's
 * collections) print none.
 *
 * A list and not a rule from the printed total: Pokémon Futsal prints 001 of five cards, and Cosmic
 * Eclipse, with 236, prints 1.
 */
export const THREE_DIGIT_SETS = [
  "swsh1",
  "swsh2",
  "swsh3",
  "swsh3.5",
  "swsh4",
  "swsh4.5",
  "swsh5",
  "swsh6",
  "swsh7",
  "swsh8",
  "cel25",
  "fut2020",
  "2023sv",
  "2024sv",
  "np",
];

const THREE_DIGITS = new Set(THREE_DIGIT_SETS);

/**
 * The set a card id is filed under: everything before its last hyphen ("tk-hs-g-21" is tk-hs-g).
 *
 * @param {string} id
 */
const setOf = (id) => id.slice(0, Math.max(0, id.lastIndexOf("-")));

/**
 * A card's number as it prints, where TCGdex writes it another way. Only the number a person reads
 * moves: the card's id, its picture's address and its price link stay TCGdex's, and every comparison
 * with a collection row folds the spelling (canonNumber).
 *
 * - Aquapolis' and Skyridge's holo run prints H1 to H9 without the zero TCGdex gives them (H01), read
 *   off TCGplayer's and Scrydex's pictures of the cards (naming pass, 2026-09-15).
 * - Two Black & White promos print BW004 and BW005 among BW01 to BW101.
 * - The sets in THREE_DIGIT_SETS print 001 to 099 where TCGdex writes 1 to 99.
 *
 * @param {string} id the catalogue's card id, as TCGdex gives it
 * @param {string} number the number TCGdex gives it
 * @returns {string}
 */
export function correctedNumber(id, number) {
  const set = setOf(id);
  if ((set === "ecard2" || set === "ecard3") && /^H0\d$/.test(number)) return `H${number.slice(2)}`;
  if (set === "bwp" && /^BW0[45]$/.test(number)) return `BW00${number.slice(3)}`;
  if (THREE_DIGITS.has(set) && /^\d{1,2}$/.test(number)) return number.padStart(3, "0");
  return number;
}
