/**
 * Writes classic-collection-numbers.generated.json: the number each Classic Collection card prints.
 *
 * A Classic Collection reprints older cards with their original number: 30th Classic Collection's
 * Charizard prints 4/102, Celebrations Classic Collection's Blastoise 2/102. TCGdex numbers them 001
 * to 030 and CC001 to CC025, which is not on the cards, and 30th Celebration's own 001 (Exeggcute)
 * read the same "30C 001" as the Charizard. TCGplayer's product data carries the printed number
 * ("Number" in tcgcsv's extendedData), and every card of both sets is linked to its product in
 * tcgplayer-ids.generated.json, so the number is read from there, never typed.
 *
 * Every TCGplayer group was scanned for another set of this kind on 2026-09-17 (groups named
 * "Classic" or "Collection"): only these two print another set's number.
 *
 *   node scripts/classic-collection-numbers.mjs [--dry]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const IDS = join(ROOT, "src", "lib", "core", "tcgplayer-ids.generated.json");
const OUT = join(
  ROOT,
  "src",
  "lib",
  "core",
  "catalogue",
  "classic-collection-numbers.generated.json",
);
const DRY = process.argv.includes("--dry");

/** The catalogue sets whose cards print another set's number. */
const SETS = ["30th-c", "cel25cc"];

const ids = JSON.parse(readFileSync(IDS, "utf8"));
const groups = new Map();
const out = {};
for (const [id, link] of Object.entries(ids)) {
  const set = id.slice(0, id.lastIndexOf("-"));
  if (!SETS.includes(set)) continue;
  if (!link?.productId || !link.groupId) throw new Error(`${id} has no TCGplayer product`);
  if (!groups.has(link.groupId)) {
    const res = await fetch(`https://tcgcsv.com/tcgplayer/3/${link.groupId}/products`, {
      headers: { accept: "application/json", "User-Agent": "cardorb.com" },
    });
    if (!res.ok) throw new Error(`tcgcsv group ${link.groupId}: ${res.status}`);
    const { results } = await res.json();
    groups.set(link.groupId, new Map(results.map((p) => [p.productId, p])));
  }
  const product = groups.get(link.groupId).get(link.productId);
  const number = product?.extendedData?.find((e) => e.name === "Number")?.value?.trim();
  if (!number || !/^\d+\/\d+$/.test(number))
    throw new Error(`${id}: no printed number (${number})`);
  out[id] = number;
}

const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
console.log(`${Object.keys(sorted).length} cards`);
if (!DRY) writeFileSync(OUT, `${JSON.stringify(sorted, null, 2)}\n`);
