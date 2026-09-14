/**
 * Writes tcgplayer-patterns.generated.json: for every English card TCGplayer sells a cosmos or
 * cracked ice print of, which prints, their finish and their TCGplayer product; and for every card
 * it sells a Poké Ball, Master Ball or Energy Symbol reverse of, those (`finishPrints`), which a
 * form offers as finishes and the price job prices under their own printing.
 *
 * The card's sheet answers these as `patternPrints`, and a form offers Standard plus those patterns
 * and nothing else (card-printings.ts patternPrintsFor). The rules for matching a pattern product
 * to a card are in src/lib/core/foil-pattern-products.mjs.
 *
 * Every English group's products and prices from tcgcsv, about 440 requests. Needs nothing but
 * tcgcsv and tcgplayer-ids.generated.json, so it runs in the weekly links workflow after the links.
 *
 *   node scripts/tcgplayer-patterns.mjs [--dry]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { finishOfName, patternPrintsOf } from "../src/lib/core/foil-pattern-products.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const IDS = join(ROOT, "src", "lib", "core", "tcgplayer-ids.generated.json");
const OUT = join(ROOT, "src", "lib", "core", "tcgplayer-patterns.generated.json");
const DRY = process.argv.includes("--dry");

async function fetchJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: { accept: "application/json", "User-Agent": "cardorb.com" },
    });
    if (res.ok) return res.json();
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error(`${url}: gave up`);
}

async function mapLimit(items, limit, fn) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        await fn(items[i]);
      }
    }),
  );
}

const links = JSON.parse(readFileSync(IDS, "utf8"));
const { results: groups } = await fetchJson("https://tcgcsv.com/tcgplayer/3/groups");
const products = [];
const subtypes = new Map();
/* Every group must answer: a group missing would silently drop its pattern prints from the file,
   and a form would stop offering a pattern that exists. Better no file than a thinner one. */
await mapLimit(groups, 8, async (g) => {
  const [p, r] = await Promise.all([
    fetchJson(`https://tcgcsv.com/tcgplayer/3/${g.groupId}/products`),
    fetchJson(`https://tcgcsv.com/tcgplayer/3/${g.groupId}/prices`),
  ]);
  products.push(...(p?.results ?? []));
  for (const row of r?.results ?? []) {
    const names = subtypes.get(row.productId) ?? new Set();
    names.add(row.subTypeName);
    subtypes.set(row.productId, names);
  }
});

const { cards, unmatched, ambiguous } = patternPrintsOf(products, subtypes, links);
const prints = Object.values(cards).reduce((n, c) => n + c.prints.length, 0);
const finishPrints = Object.values(cards).reduce((n, c) => n + (c.finishPrints?.length ?? 0), 0);
console.log(
  `tcgcsv: ${groups.length} groups, ${products.length} products. ${Object.keys(cards).length} cards with ${prints} pattern prints and ${finishPrints} Poké Ball, Master Ball or Energy Symbol reverses; ${unmatched.length} pattern products matched no card, ${ambiguous.length} more than one.`,
);
for (const p of unmatched)
  if (finishOfName(p.name)) console.log(`  unmatched reverse: ${p.productId} ${p.name}`);
for (const p of ambiguous) console.log(`  ambiguous: ${p.productId} ${p.name}`);

if (!DRY) writeFileSync(OUT, `${JSON.stringify(cards, null, 2)}\n`);
