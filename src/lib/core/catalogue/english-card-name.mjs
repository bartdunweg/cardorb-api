/**
 * The English name of a card from a catalogue that has none.
 *
 * TCGdex names a Japanese card in its own script and nowhere else: there is no
 * English catalogue holding リザードンex, because the English game never printed that card. The
 * app is English throughout (Bart's call, 2026-09-11), so the name is worked out from two places
 * that do write it in English, in this order:
 *
 *   1. The card's own TCGdex record, for a Pokémon: its national Dex number(s) name the species
 *      in English (pokedex.generated.json), and the Latin letters at the end of the printed name
 *      are the suffix as printed: ex, EX, GX, V, VMAX. A tag team joins its species with " & ".
 *   2. The printed name itself, where the record carries no Dex number: the species whose name in
 *      that script sits inside the card's name, longest first, as the Pokédex files a card
 *      (pokedex.ts). ヌイコグマ is Stufful because species-names.generated.json says so. Each half
 *      of a tag team on its own.
 *
 * A trainer or an energy keeps its own name: nothing here can translate one, and a guess would be
 * a second identity to keep straight. The 10,350 names written before 2026-09-12 came first off
 * Cardmarket's product list, through the Cardmarket id maps; those went with Cardmarket, and the
 * names they gave stay in the map as written.
 *
 * Pure, and an .mjs so the script that writes the map and the test that guards the rules read
 * the same code (as price-basis.mjs is).
 */

/**
 * The species suffix as the card prints it: the Latin letters, digits, dots and spaces that end
 * a Japanese name, which are the same on every printing of the game: "ex", "GX", "VMAX", "VSTAR",
 * "BREAK", "LV.X". Empty where the name is all script.
 */
export function printedSuffix(localName) {
  const m = /[A-Za-z][A-Za-z0-9.\- ]*$/.exec(String(localName ?? "").trim());
  return m ? m[0].trim() : "";
}

/**
 * A Pokémon's English name from its own record: species by Dex number, tag teams joined with
 * " & ", the printed suffix kept. Null for a trainer or an energy, or a record with no Dex number.
 */
export function englishFromRecord(record, species) {
  const dex = Array.isArray(record?.dexId) ? record.dexId : [];
  const names = dex.map((n) => species[n - 1]).filter(Boolean);
  if (!names.length || names.length !== dex.length) return null;
  const suffix = printedSuffix(record.name);
  return suffix ? `${names.join(" & ")} ${suffix}` : names.join(" & ");
}

/** Which column of species-names.generated.json a catalogue reads. */
const COLUMN = { ja: "ja" };

const byLength = new Map();
/** Every species with a name in that script, longest first, so the longest match is the first hit. */
function speciesIn(lang, localNames) {
  const had = byLength.get(lang);
  if (had) return had;
  const column = COLUMN[lang];
  const built = localNames
    .map((row, i) => ({ id: i + 1, key: row?.[column] ?? "" }))
    .filter((s) => s.key)
    .sort((a, b) => b.key.length - a.key.length);
  byLength.set(lang, built);
  return built;
}

/**
 * A Pokémon's English name from its printed name alone: the species named in that script inside
 * it, tag teams split at "&", the printed suffix kept. Null where no species is found — a trainer,
 * an energy, or a name the table does not carry.
 */
export function englishFromLocalName(lang, localName, localNames, species) {
  if (!COLUMN[lang] || typeof localName !== "string") return null;
  const suffix = printedSuffix(localName);
  const body = suffix ? localName.slice(0, localName.length - suffix.length) : localName;
  const parts = body
    .split(/[&＆]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const table = speciesIn(lang, localNames);
  const names = parts.map((part) => {
    const hit = table.find((s) => part.includes(s.key));
    return hit ? species[hit.id - 1] : null;
  });
  if (names.some((n) => !n)) return null;
  return suffix ? `${names.join(" & ")} ${suffix}` : names.join(" & ");
}
