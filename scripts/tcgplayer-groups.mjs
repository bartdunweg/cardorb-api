/**
 * Which tcgcsv group every TCGplayer product is in, for the English and the Japanese shelf.
 *
 * A card's product id comes from TCGdex (tcgplayer-ids.generated.json) or from tcgplayer-links.mjs,
 * but tcgcsv publishes prices a group at a time, so a price read needs the group too. Browse, search
 * and the collection ask a group once a day and read every card of it out of that one answer.
 *
 * Writes src/lib/core/tcgplayer-groups.generated.json: `{ "3": { productId: groupId }, "85": {...} }`,
 * the category first because a product id is TCGplayer's across both shelves but the price path
 * is per category. Rerun when new sets are released; a product it does not know is unpriced, not
 * wrong.
 *
 *   node scripts/tcgplayer-groups.mjs
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "src", "lib", "core", "tcgplayer-groups.generated.json");
const CATEGORIES = [3, 85];

async function fetchJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    // tcgcsv answers 401 to a request that does not say who is asking.
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

const out = {};
for (const category of CATEGORIES) {
  const { results: groups } = await fetchJson(`https://tcgcsv.com/tcgplayer/${category}/groups`);
  const map = {};
  await mapLimit(groups, 8, async (g) => {
    const { results } = await fetchJson(
      `https://tcgcsv.com/tcgplayer/${category}/${g.groupId}/products`,
    );
    for (const p of results) map[p.productId] = g.groupId;
  });
  // Sorted, so a rerun's diff is the new products alone.
  out[category] = Object.fromEntries(
    Object.keys(map)
      .map(Number)
      .sort((a, b) => a - b)
      .map((id) => [id, map[id]]),
  );
  console.log(`category ${category}: ${groups.length} groups, ${Object.keys(map).length} products`);
}
writeFileSync(OUT, `${JSON.stringify(out)}\n`);
