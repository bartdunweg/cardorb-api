/**
 * The official artwork for every Pokémon, into public/artwork/pokedex.
 *
 *   node scripts/pokedex-art.mjs        # --force to refetch what is already there
 *
 * What it is for: the empty slots in the Pokédex on /cards. A slot with nothing
 * in it used to be a dashed rectangle, which says "no card" but not "which
 * Pokémon", and the whole point of a dex is that you can see what you are
 * missing. This is that picture.
 *
 * Local, like every other image on this site, and for the same reasons the
 * localise script gives: nothing here should depend on a third party being up
 * and in a good mood at render time. The source is PokéAPI's sprite repository,
 * which is CC0.
 *
 * Reduced to 120px on the way in. They arrive as 475px PNGs of 120 to 200kB,
 * and the tile draws them at about ninety: storing the original would be thirty
 * megabytes of detail nothing displays. sips ships with macOS, so this needs no
 * dependency, and PNG stays PNG because these have transparent backgrounds and
 * the alternative encoders are not installed here.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public", "artwork", "pokedex");
const SPECIES = JSON.parse(
  await import("node:fs/promises").then((fs) =>
    fs.readFile(join(root, "lib", "pokedex.generated.json"), "utf8"),
  ),
);

const SRC = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const MAX_EDGE = 120;
const CONCURRENCY = 8;
const GAP_MS = 40;
const FORCE = process.argv.includes("--force");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });

const ids = SPECIES.map((_, i) => i + 1).filter(
  (id) => FORCE || !existsSync(join(OUT, `${id}.png`)),
);
console.log(`${SPECIES.length} Pokémon, ${ids.length} to fetch`);

let cursor = 0;
let done = 0;
let failed = 0;
const worker = async () => {
  while (cursor < ids.length) {
    const id = ids[cursor++];
    await sleep(GAP_MS);
    const file = join(OUT, `${id}.png`);
    try {
      const res = await fetch(SRC(id), {
        headers: { "User-Agent": "bartdunweg.com (bart@strakzat.com)" },
      });
      if (!res.ok) throw new Error(String(res.status));
      const buf = Buffer.from(await res.arrayBuffer());
      // An error page is not an image, and writing one would bake a broken
      // picture in that nothing ever asks about again.
      if (buf.length < 512) throw new Error(`${buf.length} bytes`);
      writeFileSync(file, buf);
      execFileSync("sips", ["-Z", String(MAX_EDGE), file, "--out", file], { stdio: "ignore" });
    } catch (err) {
      failed++;
      if (failed <= 5) console.warn(`  #${id} ${SPECIES[id - 1]}: ${err.message}`);
    }
    if (++done % 200 === 0) console.log(`  ${done}/${ids.length}`);
  }
};
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const files = readdirSync(OUT).filter((f) => f.endsWith(".png"));
const bytes = files.reduce((n, f) => n + statSync(join(OUT, f)).size, 0);
console.log(`\nfetched ${done - failed}, failed ${failed}`);
console.log(`${files.length} files, ${(bytes / 1e6).toFixed(1)} MB in public/artwork/pokedex`);
