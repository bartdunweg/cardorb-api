/**
 * Which words in a binder's rule or a Pokédex setting match no card, apart from the query, so a
 * test can hold it (binder-rarity-words.test.ts) and scripts/data-health.mjs can run it.
 *
 * A binder rule (`collections.rule -> rarities`) and a Pokédex setting (`collections.pokedex ->
 * rarities`) keep rarities as words. A respelled rarity (migration 20260914200000 moved "Rare Holo"
 * to "Holo Rare") leaves a setting that names the old word and quietly matches nothing, and the
 * binder empties. Migrations 20260914200000 and 20260915200000 moved the settings by hand; this is
 * the check that a future respelling cannot leave one behind (R-DATA-004).
 *
 * The web app (bartdunweg/cardorb-web, src/lib/binder-rule.ts) offers the words a collection's
 * facets hold: the copy's rarity, or a row's own word where its card has none ("Holo Rare ex",
 * "Holo Rare GX", "Rainbow Rare"). A Pokédex also splits Ultra Rare, and any rarity it names that
 * way, into "<rarity> / v", "<rarity> / ex" and "<rarity> / other" (splitOf, RARITY_SPLITS there).
 *
 * Plain JavaScript, because the script runs on plain node and cannot import TypeScript.
 */

/** The split ids of web's RARITY_SPLITS. */
export const RARITY_SPLIT_IDS = ["v", "ex", "other"];

/** The rarity an entry names: "Ultra Rare / v" names Ultra Rare, a plain entry itself. */
export function rarityOfEntry(entry) {
  const m = /^(.*) \/ (v|ex|other)$/.exec(entry);
  return m ? m[1] : entry;
}

/**
 * The entries whose rarity no known word matches. Case-insensitive, as the web compares them
 * (rarityKept, ruleMatches).
 *
 * @param {string[]} entries every word the settings hold
 * @param {Iterable<string>} known the rarity words the list, the copy and the rows hold
 */
export function strayRarityEntries(entries, known) {
  const words = new Set([...known].map((w) => w.toLowerCase()));
  return entries.filter((e) => !words.has(rarityOfEntry(e).toLowerCase()));
}
