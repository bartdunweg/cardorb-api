/**
 * Fill the Cardmarket product ids TCGdex does not link, from Cardmarket's own product list.
 *
 *   node scripts/cardmarket-ids-fill.mjs          # print what it would set, and what it cannot decide
 *   node scripts/cardmarket-ids-fill.mjs --write  # set the sure ones in lib/core/cardmarket-ids.generated.json
 *
 * ── Why this exists ──
 *
 * A card is priced from Cardmarket's daily guide through its product id, and the id comes from
 * TCGdex (snapshot-collection-value.mjs writes it into the id map). TCGdex has no id for a
 * few dozen of the collection's cards, old promos mostly, and a null there was the end of it:
 * the guide could not price the card, TCGdex's own pricing block was empty for the same reason,
 * and only TCGplayer stood between the card and "no price". On 2026-09-06 that was how
 * Yveltal-EX XY150a, the Wizards promo Pikachu and Ancient Mew went unpriced for a week.
 *
 * Cardmarket publishes its product list, and every card the collection already links tells
 * which Cardmarket expansion a set is: so for a null id, look in that expansion for a product
 * with the card's name. One match is set; several (a card printed three times in one promo
 * set) are printed with their guide prices, for a person to pick by hand — the product page's
 * URL ends in the version (V3) and that is the order the products carry here.
 *
 * Run it after snapshot-collection-value.mjs has added new ids, or whenever the unpriced list
 * on /dashboard/cards?unpriced=1 is not empty.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const IDS = join(ROOT, "lib", "core", "cardmarket-ids.generated.json");
const PRODUCTS =
  "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json";
const GUIDE = "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json";

const write = process.argv.includes("--write");

/** @type {Record<string, number | null>} */
const ids = JSON.parse(readFileSync(IDS, "utf8"));
const missing = Object.keys(ids).filter((id) => ids[id] === null);
if (!missing.length) {
  console.log("Every id is linked.");
  process.exit(0);
}

const json = async (url) => (await fetch(url)).json();
const [{ products }, guideBody] = await Promise.all([json(PRODUCTS), json(GUIDE)]);
const guide = new Map((guideBody.priceGuides ?? guideBody).map((r) => [r.idProduct, r]));
const byId = new Map(products.map((p) => [p.idProduct, p]));

// Which Cardmarket expansion a TCGdex set is: the one most of its linked cards sit in.
const setOf = (id) => id.slice(0, id.lastIndexOf("-"));
const expansionOf = new Map();
for (const [id, product] of Object.entries(ids)) {
  const p = product && byId.get(product);
  if (!p) continue;
  const votes = expansionOf.get(setOf(id)) ?? new Map();
  votes.set(p.idExpansion, (votes.get(p.idExpansion) ?? 0) + 1);
  expansionOf.set(setOf(id), votes);
}
const expansion = (set) => {
  const votes = expansionOf.get(set);
  if (!votes) return null;
  return [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

// A card's name as TCGdex says it, for the compare: Cardmarket writes "Yveltal EX [Evil Ball]".
const norm = (s) =>
  s
    .toLowerCase()
    .replace(/\[.*?\]|\(.*?\)/g, "")
    .replace(/[’'.\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

let set = 0;
const undecided = [];
for (const id of missing) {
  const card = await json(`https://api.tcgdex.net/v2/en/cards/${id}`).catch(() => null);
  if (!card?.name) {
    undecided.push(`${id}: TCGdex does not know it`);
    continue;
  }
  const exp = expansion(setOf(id));
  if (exp === null) {
    undecided.push(`${id} (${card.name}): no linked card in its set to learn the expansion from`);
    continue;
  }
  const wanted = norm(card.name);
  const candidates = products.filter((p) => p.idExpansion === exp && norm(p.name) === wanted);
  if (candidates.length === 1) {
    ids[id] = candidates[0].idProduct;
    set += 1;
    console.log(`${id} (${card.name}) -> ${candidates[0].idProduct} ${candidates[0].name}`);
  } else if (candidates.length === 0) {
    undecided.push(`${id} (${card.name}): nothing by that name in expansion ${exp}`);
  } else {
    const lines = candidates.map((p, i) => {
      const g = guide.get(p.idProduct);
      return `    V${i + 1} ${p.idProduct} ${p.name} trend ${g?.trend ?? "-"} low ${g?.low ?? "-"}`;
    });
    undecided.push(
      `${id} (${card.name}): ${candidates.length} products in expansion ${exp}, pick by hand:\n${lines.join("\n")}`,
    );
  }
}

if (undecided.length) console.log(`\nUndecided (${undecided.length}):\n${undecided.join("\n")}`);
if (write && set) {
  writeFileSync(
    IDS,
    JSON.stringify(Object.fromEntries(Object.entries(ids).sort()), null, 2) + "\n",
  );
  console.log(`\nWrote ${set} id${set === 1 ? "" : "s"}.`);
} else if (set) {
  console.log(`\n${set} would be set; run with --write.`);
}
