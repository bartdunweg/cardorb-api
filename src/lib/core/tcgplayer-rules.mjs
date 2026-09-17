/**
 * What TCGplayer's product says about a card that TCGdex has wrong, as rules over every linked card.
 *
 * Plain JavaScript, like card-number.mjs, because three readers hold the copy to the same rule and
 * two of them cannot import TypeScript: the nightly copy (mirror.ts, through tcgplayer-products.ts),
 * the weekly links run (scripts/classic-collection-numbers.mjs) and the morning check
 * (scripts/data-health.mjs), which fails where what is stored is not what the rule gives today. A
 * rule changed here reaches every card, the ones copied before the change too.
 */
import { canonNumber, correctedNumber } from "./card-number.mjs";

/**
 * A product's printed number as TCGplayer writes it ("4/102", "SVP 175", "TG01/TG30"), or null.
 *
 * @param {{ extendedData?: { name: string, value: string }[] } | null | undefined} product
 * @returns {string | null}
 */
export function printedNumberOfProduct(product) {
  const value = product?.extendedData?.find((e) => e.name === "Number")?.value?.trim();
  return value || null;
}

/**
 * A product's rarity word as TCGplayer writes it, or null.
 *
 * @param {{ extendedData?: { name: string, value: string }[] } | null | undefined} product
 * @returns {string | null}
 */
export function rarityOfProduct(product) {
  const value = product?.extendedData?.find((e) => e.name === "Rarity")?.value?.trim();
  return value || null;
}

/** A number as a person reads it: the id's percent code decoded (`exu-%3F` is "?"). */
const decoded = (n) => {
  try {
    return decodeURIComponent(n);
  } catch {
    return n;
  }
};

/** "SVP 175" is SVP175: TCGplayer puts a space between some promo letters and the digits. */
const numerator = (n) =>
  String(n)
    .split("/")[0]
    .trim()
    .replace(/^([A-Za-z]+)\s+(?=\d)/, "$1");

const totalOf = (n) => {
  const m = /\/\s*[A-Za-z]*0*(\d+)\s*$/.exec(String(n));
  return m ? Number(m[1]) : null;
};

/**
 * Whether the number a card's label shows is another card's than the one TCGplayer says it prints.
 *
 * Padding, case and a promo set's letters do not count (canonNumber), and neither does a total the
 * label does not show. Where the label shows a total (a Classic Collection card's "4/102"), the total
 * counts too: Palkia LV.X 106/106 is not M Gardevoir-EX 106/160. No number from TCGplayer is no
 * disagreement.
 *
 * @param {string | null | undefined} label the number the label shows
 * @param {string | null | undefined} tcgplayer TCGplayer's printed number
 * @returns {boolean}
 */
export function numberDisagrees(label, tcgplayer) {
  if (!tcgplayer || label == null) return false;
  const shown = decoded(String(label));
  if (canonNumber(numerator(shown)) !== canonNumber(numerator(tcgplayer))) return true;
  return shown.includes("/") && totalOf(shown) !== totalOf(tcgplayer);
}

/** How many of a set's cards must carry a printed total before the set can be read as one kind. */
const CLASSIC_MIN_CARDS = 5;
/** The share of those that must print another card's number: one product's slip is not a set. */
const CLASSIC_SHARE = 0.9;

/**
 * The printed number of every card of a set whose cards print other cards' numbers, by card id.
 *
 * A Classic Collection reprints older cards with their original number: 30th Classic Collection's
 * Charizard prints 4/102 where TCGdex numbers it 001, which is 30th Celebration's Exeggcute's number
 * as well. No catalogue says which sets are of this kind, so it is read off the cards: a set is one
 * where at least five of its linked cards carry a printed total at TCGplayer and nine in ten of those
 * print a number that is not the card's own (numberDisagrees). Every card of such a set with a
 * printed total takes it, a reprint whose number happens to match its own included. A single product
 * with a slip (the XY Trainer Kit's Switch written 4/30) does not make a set one.
 *
 * @param {{ id: string, cards: { id: string, localId: string, number: string | null }[] }[]} sets
 *   each card's catalogue number and TCGplayer's printed number (null where it has none)
 * @returns {Record<string, string>}
 */
export function classicCollectionNumbers(sets) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const set of sets) {
    const totalled = set.cards.filter((c) => c.number && /^\d+\/\d+$/.test(c.number));
    if (totalled.length < CLASSIC_MIN_CARDS) continue;
    const foreign = totalled.filter((c) =>
      numberDisagrees(correctedNumber(c.id, decoded(c.localId)), c.number),
    );
    if (foreign.length < totalled.length * CLASSIC_SHARE) continue;
    for (const c of totalled) out[c.id] = /** @type {string} */ (c.number);
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/** TCGplayer's grades above a plain Rare that TCGdex writes as "Rare" for older sets. */
const ABOVE_RARE = new Set(["holo rare", "ultra rare", "secret rare"]);
/** TCGplayer's words that are no rarity: My First Battle is all "Unconfirmed". */
const NO_RARITY = new Set(["unconfirmed", "none"]);

/**
 * A card's rarity with TCGplayer's word where TCGdex has none, and TCGplayer's grade where TCGdex
 * says a plain "Rare" of a card TCGplayer grades Holo Rare, Ultra Rare or Secret Rare.
 *
 * The rule behind 1,735 of card-fact-corrections.ts's rarity entries (2026-09-14), each of which
 * says what TCGplayer says; laid down as a rule on 2026-09-17, when 30th Classic Collection came
 * with no rarity at all where Celebrations' Classic Collection had been given TCGplayer's word by
 * hand. TCGplayer's other words for a plain Rare (Prism Rare, Rare Ace, Shiny Holo Rare) stay
 * TCGdex's: Bart kept those as TCGdex has them.
 *
 * @param {string | null | undefined} rarity TCGdex's rarity after the corrections, null for none
 * @param {string | null | undefined} productRarity TCGplayer's word
 * @returns {string | null}
 */
export function tcgplayerRarity(rarity, productRarity) {
  const given = rarity ?? null;
  const word = productRarity?.trim();
  if (!word) return given;
  if (given == null || NO_RARITY.has(given.trim().toLowerCase()))
    return NO_RARITY.has(word.toLowerCase()) ? null : word;
  if (given.trim().toLowerCase() === "rare" && ABOVE_RARE.has(word.toLowerCase())) return word;
  return given;
}
