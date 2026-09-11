/**
 * The National Pokédex, as a list of names, written to lib/pokedex.generated.json.
 *
 *   node scripts/pokedex.mjs
 *
 * Why generated and not fetched at build time: the list of Pokémon changes once
 * a generation, which is roughly once every three years, and a build that talks
 * to a third party for something that stable is a build that can fail for no
 * reason. This is a table, so it lives in the repo like a table.
 *
 * The source is PokéAPI's own CSV rather than its REST endpoints: the endpoint
 * that lists species hands out lowercase slugs ("mr-mime", "farfetchd"), and the
 * display names are one request per species. The CSV holds every language at
 * once, so this is one file and one pass.
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC =
  "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv";
/**
 * PokéAPI's own language ids, read from its languages.csv rather than assumed.
 *
 * `ja-hrkt` (1) and not `ja` (11): the kanji column is the literary spelling, and a Pokémon card
 * prints the katakana one. Traditional and simplified Chinese are separate rows there and
 * separate catalogues at TCGdex, so they stay apart here too.
 */
const ENGLISH = "9";
const LOCALISED = { ja: "1", ko: "3", zhHant: "4", zhHans: "12" };

/**
 * `src` is not optional here, and was missing: this wrote to lib/core, which does not exist, so
 * the script threw before writing anything. Three sibling scripts had the same gap.
 */
const core = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "core");
const out = join(core, "pokedex.generated.json");
const outLocalised = join(core, "species-names.generated.json");

const res = await fetch(SRC);
if (!res.ok) throw new Error(`PokéAPI CSV: ${res.status}`);

/** id -> name, English only, in National Dex order. */
const names = new Map();
/** id -> { ja, ko, zhHant, zhHans }, same order, for the catalogues that are not English. */
const localised = new Map();
const langOf = Object.fromEntries(Object.entries(LOCALISED).map(([k, v]) => [v, k]));
for (const line of (await res.text()).trim().split("\n").slice(1)) {
  // id,language,name,genus. The genus can hold a comma; the first three fields
  // cannot, so splitting on the first two commas and keeping the rest is enough.
  const [id, lang, rest] = [
    line.slice(0, line.indexOf(",")),
    line.slice(line.indexOf(",") + 1, line.indexOf(",", line.indexOf(",") + 1)),
    line.slice(line.indexOf(",", line.indexOf(",") + 1) + 1),
  ];
  const name = rest.slice(0, rest.indexOf(","));
  if (lang === ENGLISH) {
    names.set(Number(id), name);
    continue;
  }
  const key = langOf[lang];
  if (!key) continue;
  localised.set(Number(id), { ...localised.get(Number(id)), [key]: name });
}

const max = Math.max(...names.keys());
const list = Array.from({ length: max }, (_, i) => names.get(i + 1) ?? "");
const missing = list.filter((n) => !n).length;
if (missing) throw new Error(`${missing} species have no English name`);

writeFileSync(out, `${JSON.stringify(list, null, 1)}\n`);

/**
 * The same thousand and twenty-five, in the languages whose catalogues Cardorb reads.
 *
 * A card from the Japanese shelf is named in Japanese, so the English list cannot place it in a
 * Pokédex slot and it landed in none. These are the names to match it against instead.
 *
 * A file of its own rather than folded into the first: that one is a plain list of English names,
 * it is what `/v1/public/species` serves, and both clients decode it as an array of strings.
 */
const localisedList = Array.from({ length: max }, (_, i) => localised.get(i + 1) ?? {});
const thin = localisedList.filter((r) => !r.ja).length;
if (thin) throw new Error(`${thin} species have no Japanese name`);

writeFileSync(outLocalised, `${JSON.stringify(localisedList, null, 1)}\n`);
console.log(`${list.length} Pokémon written, with their ja, ko and zh names beside them`);
