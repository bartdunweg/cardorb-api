/**
 * The English name of every card on the Japanese, Korean and Chinese shelves.
 *
 *   node scripts/language-card-names.mjs            # every catalogue, print what it found
 *   node scripts/language-card-names.mjs --write    # write the maps
 *   node scripts/language-card-names.mjs --write ja # one catalogue
 *
 * ── Why this exists ──
 *
 * TCGdex names a card from these catalogues in its own script and has no English for it (there is
 * no English printing to borrow from). The app is English throughout, so a set page or a
 * collection row would otherwise read リザードンex under a card everyone here calls Charizard ex.
 *
 * The rules are in src/lib/core/catalogue/english-card-name.mjs. Their inputs come from two
 * downloads: Cardmarket's product list (13 MB, one request, every product it sells with its
 * English name) read through the committed product id maps, and, for a card Cardmarket has no
 * product for, the card's own TCGdex record — one request per such card, a few thousand across
 * the four catalogues, where the id maps needed twenty-one thousand.
 *
 * One file per catalogue, as the id maps are, because the ids collide between them. Runs after
 * language-cardmarket-ids.mjs: a card the id map does not have is a card this cannot name.
 *
 * Re-runnable. A name already written is kept, so a second run only reads what was added since
 * and asks again about what it could not name last time; pass --refresh to re-read Cardmarket for
 * every card (a product renamed there).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  englishFromLocalName,
  englishFromProduct,
  englishFromRecord,
} from "../src/lib/core/catalogue/english-card-name.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORE = join(ROOT, "src", "lib", "core");
const HOST = "https://api.tcgdex.net/v2";
const PRODUCTS =
  "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json";
const LANGUAGES = ["ja", "zh-tw", "zh-cn", "ko"];

const args = process.argv.slice(2);
const write = args.includes("--write");
const refresh = args.includes("--refresh");
const only = args.filter((a) => !a.startsWith("--"));
const languages = only.length ? LANGUAGES.filter((l) => only.includes(l)) : LANGUAGES;

const idsFile = (lang) => join(CORE, `cardmarket-ids.${lang}.generated.json`);
const namesFile = (lang) => join(CORE, `card-names.${lang}.generated.json`);
const SPECIES = JSON.parse(
  readFileSync(join(ROOT, "src", "lib", "core", "pokedex.generated.json"), "utf8"),
);
const LOCAL_NAMES = JSON.parse(
  readFileSync(join(ROOT, "src", "lib", "core", "species-names.generated.json"), "utf8"),
);

/** One GET, with a retry: a catalogue that refuses once under load answers the second time. */
async function json(url) {
  for (let tries = 0; tries < 3; tries++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "cardorb.com" } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${res.status}`);
      return await res.json();
    } catch (err) {
      if (tries === 2) throw new Error(`${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 500 * (tries + 1)));
    }
  }
}

/** Eight at a time, as the id script runs and TCGdex tolerates. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i], i);
    }),
  );
  return out;
}

process.stdout.write("Cardmarket product list… ");
const products = new Map(
  ((await json(PRODUCTS))?.products ?? []).map((p) => [p.idProduct, p.name]),
);
console.log(`${products.size} products.`);

for (const lang of languages) {
  const ids = JSON.parse(readFileSync(idsFile(lang), "utf8"));
  const known = existsSync(namesFile(lang))
    ? JSON.parse(readFileSync(namesFile(lang), "utf8"))
    : {};
  const all = Object.keys(ids);
  const wanted = all.filter((id) => refresh || !known[id]);

  let fromCardmarket = 0;
  const askTcgdex = [];
  for (const id of wanted) {
    const product = ids[id];
    const name = product != null ? englishFromProduct(products.get(product)) : null;
    if (name) {
      known[id] = name;
      fromCardmarket++;
    } else askTcgdex.push(id);
  }

  process.stdout.write(
    `${lang}: ${all.length} cards, ${wanted.length} to name, ${fromCardmarket} from Cardmarket, ${askTcgdex.length} to ask TCGdex… `,
  );
  let fromRecord = 0;
  let asked = 0;
  await mapLimit(askTcgdex, 8, async (id) => {
    const record = await json(`${HOST}/${lang}/cards/${encodeURIComponent(id)}`);
    const name =
      englishFromRecord(record, SPECIES) ??
      englishFromLocalName(lang, record?.name, LOCAL_NAMES, SPECIES);
    // Null is kept: this card has no English name anywhere, and the next run need not ask again.
    known[id] = name;
    if (name) fromRecord++;
    if (++asked % 500 === 0) process.stdout.write(`${asked}… `);
  });

  const named = Object.values(known).filter(Boolean).length;
  console.log(`${fromRecord} from the record; ${named} of ${Object.keys(known).length} named.`);
  if (write) {
    const sorted = Object.fromEntries(
      Object.keys(known)
        .sort()
        .map((k) => [k, known[k]]),
    );
    writeFileSync(namesFile(lang), `${JSON.stringify(sorted, null, 2)}\n`);
  }
}

if (!write) console.log("\nNothing written. Re-run with --write.");
