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
/** 9 is English in PokéAPI's language table. */
const ENGLISH = "9";

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "lib",
  "core",
  "pokedex.generated.json",
);

const res = await fetch(SRC);
if (!res.ok) throw new Error(`PokéAPI CSV: ${res.status}`);

/** id -> name, English only, in National Dex order. */
const names = new Map();
for (const line of (await res.text()).trim().split("\n").slice(1)) {
  // id,language,name,genus. The genus can hold a comma; the first three fields
  // cannot, so splitting on the first two commas and keeping the rest is enough.
  const [id, lang, rest] = [
    line.slice(0, line.indexOf(",")),
    line.slice(line.indexOf(",") + 1, line.indexOf(",", line.indexOf(",") + 1)),
    line.slice(line.indexOf(",", line.indexOf(",") + 1) + 1),
  ];
  if (lang !== ENGLISH) continue;
  names.set(Number(id), rest.slice(0, rest.indexOf(",")));
}

const max = Math.max(...names.keys());
const list = Array.from({ length: max }, (_, i) => names.get(i + 1) ?? "");
const missing = list.filter((n) => !n).length;
if (missing) throw new Error(`${missing} species have no English name`);

writeFileSync(out, `${JSON.stringify(list, null, 1)}\n`);
console.log(`${list.length} Pokémon written to lib/pokedex.generated.json`);
