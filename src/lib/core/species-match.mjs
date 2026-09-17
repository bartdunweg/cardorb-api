/**
 * Which Pokémon a card's name holds, as a pure rule both the collection (collection/pokedex.ts)
 * and scripts/data-health.mjs read.
 *
 * Plain JavaScript, like price-basis.mjs, because the data-health script runs on plain node and
 * cannot import TypeScript. The species tables are passed in: a script reads the generated JSON
 * from disk, the app imports it.
 */

/**
 * Down to letters and digits.
 *
 * Punctuation is what separates "Mr. Mime" from "Mr Mime" from "Mr.Mime", and TCGdex, Notion and
 * the cards themselves do not agree on which. The gender signs stay, as letters: they are the only
 * thing telling the two Nidoran apart, and dropping them would merge a species with another one.
 *
 * @param {string} name
 */
export function normalise(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/♀/g, "f")
    .replace(/♂/g, "m")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * The same question in a language that is not written in this alphabet.
 *
 * `normalise` keeps `[a-z0-9]` and nothing else, which is right for the Latin catalogues and
 * empties a Japanese name completely. This keeps any script's letters and digits and drops only
 * what separates them, so ピカチュウex reduces to ピカチュウex and still contains ピカチュウ. NFKC
 * first: a card prints its suffix full-width often enough (ｅｘ).
 *
 * @param {string} name
 */
export function normaliseLocal(name) {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Every species, longest name first, so the longest match is the first hit (Mewtwo before Mew).
 *
 * @param {readonly (string | null | undefined)[]} names by National Dex number, from 1
 * @param {(name: string) => string} fold normalise or normaliseLocal
 * @returns {{ id: number, key: string }[]}
 */
export const speciesIndex = (names, fold) =>
  names
    .map((name, i) => ({ id: i + 1, key: fold(name ?? "") }))
    .filter((e) => e.key)
    .sort((a, b) => b.key.length - a.key.length);

/**
 * The species a folded card name holds, the longest first, or null.
 *
 * @param {string} key the card's name, folded as the index was
 * @param {{ id: number, key: string }[]} index
 */
export const speciesInKey = (key, index) =>
  key ? (index.find((s) => key.includes(s.key))?.id ?? null) : null;

/**
 * A tag team's halves: "Pikachu & Zekrom-GX" is a card of Pikachu and of Zekrom. Split on the
 * ampersand, full-width on the Japanese shelf. One part for every other card.
 *
 * @param {string} name
 */
export const nameParts = (name) => name.split(/\s*[&＆]\s*/).filter(Boolean);

/**
 * Whether a card of this category can fill a Pokédex slot. Only a Pokémon card can: a name match
 * alone put 61 English trainers in a slot on 2026-09-17 ("Aaron's Collection" as Aron, "Hypnotoxic
 * Laser" as Hypno, "Clefairy Doll" as Clefairy, the Spirit Link tools). A card whose category is
 * not known (a row the catalogues never matched) keeps the name match: no answer is no reason to
 * take its Pokémon away.
 *
 * @param {string | null | undefined} category the catalogue's word: Pokemon, Trainer or Energy
 */
export const fillsPokedexSlot = (category) => category == null || category === "Pokemon";
