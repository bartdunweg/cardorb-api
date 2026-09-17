/**
 * Writes classic-collection-numbers.generated.json: the number each card prints where it is another
 * card's number, for every set of that kind.
 *
 * A Classic Collection reprints older cards with their original number: 30th Classic Collection's
 * Charizard prints 4/102, Celebrations Classic Collection's Blastoise 2/102. TCGdex numbers them 001
 * to 030 and CC001 to CC025, which is not on the cards, and 30th Celebration's own 001 (Exeggcute)
 * read the same "30C 001" as the Charizard. TCGplayer's product data carries the printed number
 * ("Number" in tcgcsv's extendedData).
 *
 * Which sets are of this kind is not a list: every English set TCGdex publishes is read, each linked
 * card's printed number laid beside its own, and a set whose cards print other cards' numbers is
 * found by the rule in tcgplayer-rules.mjs (classicCollectionNumbers). Until 2026-09-17 the two sets
 * were typed in here, so a third would have been read by its TCGdex number again. Runs weekly in
 * .github/workflows/tcgplayer-links.yml, after the links it reads; scripts/data-health.mjs fails on a
 * card whose printed number the label does not show.
 *
 *   node scripts/classic-collection-numbers.mjs [--dry]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  classicCollectionNumbers,
  printedNumberOfProduct,
} from "../src/lib/core/tcgplayer-rules.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const IDS = join(ROOT, "src", "lib", "core", "tcgplayer-ids.generated.json");
const GROUPS = join(ROOT, "src", "lib", "core", "tcgplayer-groups.generated.json");
const OUT = join(
  ROOT,
  "src",
  "lib",
  "core",
  "catalogue",
  "classic-collection-numbers.generated.json",
);
const DRY = process.argv.includes("--dry");

async function fetchJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    // tcgcsv answers 401 to a request that does not say who is asking.
    const res = await fetch(url, {
      headers: { accept: "application/json", "User-Agent": "cardorb.com" },
    });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error(`${url}: gave up`);
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const ids = JSON.parse(readFileSync(IDS, "utf8"));
const groupOf = JSON.parse(readFileSync(GROUPS, "utf8"))["3"] ?? {};

const index = (await fetchJson("https://api.tcgdex.net/v2/en/sets")) ?? [];
if (!index.length) throw new Error("TCGdex listed no English set");
const sets = await mapLimit(index, 6, (s) =>
  fetchJson(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(s.id)}`),
);

// Every group a linked card's product is in, read once. A group that will not answer ends the run:
// a set read without its numbers would drop out of the file.
const groupIds = new Set();
for (const link of Object.values(ids)) {
  const group = link?.groupId ?? (link?.productId != null ? groupOf[link.productId] : undefined);
  if (group != null) groupIds.add(group);
}
const numbers = new Map();
await mapLimit([...groupIds], 8, async (groupId) => {
  const body = await fetchJson(`https://tcgcsv.com/tcgplayer/3/${groupId}/products`);
  if (!body) throw new Error(`tcgcsv group ${groupId}: not found`);
  for (const p of body.results ?? []) numbers.set(p.productId, printedNumberOfProduct(p));
});

const out = classicCollectionNumbers(
  sets.filter(Boolean).map((set) => ({
    id: set.id,
    cards: (set.cards ?? []).map((c) => ({
      id: c.id,
      localId: c.localId,
      number: ids[c.id]?.productId != null ? (numbers.get(ids[c.id].productId) ?? null) : null,
    })),
  })),
);

const bySet = new Map();
for (const id of Object.keys(out)) {
  const set = id.slice(0, id.lastIndexOf("-"));
  bySet.set(set, (bySet.get(set) ?? 0) + 1);
}
console.log(
  `${Object.keys(out).length} cards in ${bySet.size} sets: ${[...bySet].map(([s, n]) => `${s} ${n}`).join(", ")}`,
);
if (!DRY) writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
