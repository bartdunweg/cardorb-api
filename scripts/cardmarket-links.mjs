/**
 * The path to a card's own page on Cardmarket, into
 * lib/cardmarket-links.generated.json.
 *
 *   node scripts/cardmarket-links.mjs
 *   node scripts/cardmarket-links.mjs --list   # the expansion table, to check by hand
 *
 * No running build needed, unlike the other scripts here: everything it joins is
 * already on disk or public.
 *
 * ── Why this exists ──
 *
 * The button on a card page used to be a search, built from the card's name and
 * the name of the set it came from, and it almost always found nothing. The
 * reason is in Cardmarket's own catalogue: a product there is called
 * "Alakazam [Damage Swap | Confuse Ray]", the attacks rather than the set, and
 * the expansion is not part of the searchable name at all. So every query was a
 * card name plus a phrase that appears in no product name on the site.
 *
 * What they do publish is enough to address the card directly. A product page is
 *
 *   /en/Pokemon/Products/Singles/<expansion>/<product>
 *
 * and both halves of that are the two names hyphenated. The product name is in
 * the catalogue below. The expansion name is the one thing they do not publish
 * in any file, so it is seeded from the set name TCGdex uses and corrected by
 * hand in EXPANSIONS: --list prints one sample URL per set for exactly that.
 *
 * ── Why by hand ──
 *
 * Cardmarket sits behind a bot check that answers 403 to anything that is not a
 * browser, so a script cannot confirm its own output. Rather than pretend
 * otherwise, a set whose slug has not been checked is simply left out of the
 * file, and lib/cards.ts falls back to a search on the exact product name, which
 * is a worse link but never a broken one.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
/** tcgId -> Cardmarket idProduct, written by scripts/snapshot-collection-value.mjs. */
const IDS = join(ROOT, "lib", "core", "cardmarket-ids.generated.json");
const OUT = join(ROOT, "lib", "core", "cardmarket-links.generated.json");

/** Every Pokémon single they sell, rebuilt nightly. Public, no login. 13MB. */
const CATALOGUE =
  "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json";

const LIST = process.argv.includes("--list");

/**
 * Cardmarket's expansion slug for the sets in this collection, by their
 * idExpansion, where the seeded guess was wrong.
 *
 * Empty on purpose. Run --list, open the sample URLs, and add a line here for
 * every one that 404s. A set that is neither seeded correctly nor listed here is
 * left out of the file entirely rather than guessed at, so nothing in this table
 * is ever a link nobody has opened.
 *
 * @type {Record<number, string>}
 */
const EXPANSIONS = {};

/**
 * A name as Cardmarket puts it in a URL.
 *
 * Their product names carry the attacks in brackets, separated by a pipe, and
 * the slug is what is left once the punctuation goes and the spaces become
 * hyphens: "Alakazam [Damage Swap | Confuse Ray]" is
 * Alakazam-Damage-Swap-Confuse-Ray. Accents are folded because their expansion
 * names carry them ("Pokémon") and their URLs do not.
 *
 * An apostrophe is dropped rather than treated as punctuation to break on, which
 * is the one case where those two answers differ: "Erika's Tangela" is
 * Erikas-Tangela, not Erika-s-Tangela.
 */
const slug = (name) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/ /g, "-");

const get = async (url, what) => {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${what}: ${res.status}`);
  return res.json();
};

async function main() {
  if (!existsSync(IDS)) {
    throw new Error(`${IDS} is missing. Run scripts/snapshot-collection-value.mjs first.`);
  }
  /** @type {Record<string, number | null>} */
  const ids = JSON.parse(readFileSync(IDS, "utf8"));

  console.log("· Cardmarket catalogue");
  const catalogue = await get(CATALOGUE, "product catalogue");
  const products = new Map(catalogue.products.map((p) => [p.idProduct, p]));
  console.log(`  ${products.size.toLocaleString("en")} singles`);

  console.log("· TCGdex sets");
  const sets = await get("https://api.tcgdex.net/v2/en/sets", "sets index");
  const setName = new Map(sets.map((s) => [s.id, s.name]));

  /**
   * idExpansion -> the set it is, and how many of our cards say so.
   *
   * Counted rather than taken from the first card, because a set that was
   * printed twice (a reprint, a promo run) has cards filed under more than one
   * expansion, and the one most of the collection sits in is the one the link
   * should point at.
   */
  const seen = new Map();
  for (const [tcgId, idProduct] of Object.entries(ids)) {
    const product = idProduct && products.get(idProduct);
    if (!product) continue;
    const setId = tcgId.slice(0, tcgId.lastIndexOf("-"));
    const name = setName.get(setId);
    if (!name) continue;
    const row = seen.get(product.idExpansion) ?? { name, count: 0 };
    row.count++;
    seen.set(product.idExpansion, row);
  }

  const expansionSlug = (idExpansion) => {
    if (EXPANSIONS[idExpansion]) return EXPANSIONS[idExpansion];
    const row = seen.get(idExpansion);
    return row ? slug(row.name) : null;
  };

  if (LIST) {
    console.log("\n  Open each of these. Add a line to EXPANSIONS for every 404.\n");
    for (const [idExpansion, row] of [...seen].sort((a, b) => b[1].count - a[1].count)) {
      const sample = [...Object.values(ids)]
        .map((p) => p && products.get(p))
        .find((p) => p && p.idExpansion === idExpansion);
      const where = EXPANSIONS[idExpansion] ? "by hand" : "seeded";
      console.log(`  ${row.name} (${row.count} cards, ${where})`);
      console.log(
        `    https://www.cardmarket.com/en/Pokemon/Products/Singles/${expansionSlug(idExpansion)}/${slug(sample.name)}\n`,
      );
    }
    return;
  }

  /** @type {Record<string, string>} */
  const out = {};
  let unknown = 0;
  for (const [tcgId, idProduct] of Object.entries(ids)) {
    const product = idProduct && products.get(idProduct);
    if (!product) continue;
    const expansion = expansionSlug(product.idExpansion);
    if (!expansion) {
      unknown++;
      continue;
    }
    out[tcgId] = `${expansion}/${slug(product.name)}`;
  }

  const sorted = Object.fromEntries(
    Object.entries(out).sort(([a], [b]) => a.localeCompare(b, "en")),
  );
  writeFileSync(OUT, JSON.stringify(sorted, null, 2) + "\n");
  console.log(
    `\n  ${Object.keys(sorted).length.toLocaleString("en")} cards linked, ${unknown} left to the search fallback`,
  );
  console.log(`  → ${OUT}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
