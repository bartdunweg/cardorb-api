/**
 * Writes number-padding.generated.json: for every English set, one card numbered below ten and the
 * number that card prints, as Scrydex and TCGplayer each give it.
 *
 * Whether a set prints "001/202" or "1/102" is what THREE_DIGIT_SETS in card-number.mjs records for the
 * sets TCGdex writes bare, and a new set was never looked at (follow-up 1 of cardorb-api#534).
 * number-padding.mjs says why Scrydex decides and TCGplayer is read beside it; scripts/data-health.mjs
 * fails on a set whose stored spelling is not what Scrydex says it prints, and on a set this file has
 * no reading for, and reports where the two sources disagree.
 *
 * About 210 TCGdex requests, one tcgcsv read per linked group, Scrydex's expansions page and one
 * Scrydex card page per set, a second apart. Runs weekly in .github/workflows/tcgplayer-links.yml.
 *
 *   node scripts/number-padding.mjs [--dry]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { correctedNumber } from "../src/lib/core/card-number.mjs";
import { paddingWitness, scrydexPrintedNumber } from "../src/lib/core/number-padding.mjs";
import { nameKey, scrydexExpansions } from "../src/lib/core/set-facts-rules.mjs";
import { printedNumberOfProduct } from "../src/lib/core/tcgplayer-rules.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const CORE = join(ROOT, "src", "lib", "core");
const OUT = join(CORE, "catalogue", "number-padding.generated.json");
const DRY = process.argv.includes("--dry");
const HEADERS = { "User-Agent": "cardorb.com" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, { json = false } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: HEADERS }).catch(() => null);
    if (res?.ok) return json ? res.json() : res.text();
    if (res?.status === 404) return null;
    await sleep(1000 * (attempt + 1));
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

const links = JSON.parse(readFileSync(join(CORE, "tcgplayer-ids.generated.json"), "utf8"));
const groupOf =
  JSON.parse(readFileSync(join(CORE, "tcgplayer-groups.generated.json"), "utf8"))["3"] ?? {};
const ptcg = JSON.parse(readFileSync(join(CORE, "catalogue", "ptcg-set-ids.json"), "utf8"));

const index = (await fetchText("https://api.tcgdex.net/v2/en/sets", { json: true })) ?? [];
if (!index.length) throw new Error("TCGdex listed no English set");
const sets = (
  await mapLimit(index, 6, (s) =>
    fetchText(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(s.id)}`, { json: true }),
  )
).filter(Boolean);

// Scrydex's code for each TCGdex set: pokemontcg.io's id where ptcg-set-ids.json maps it, the same
// id, or the same name.
const expansions = scrydexExpansions(
  (await fetchText("https://scrydex.com/pokemon/expansions")) ?? "",
);
if (!expansions.length) throw new Error("Scrydex listed no English expansion");
const codeOf = new Map();
for (const e of expansions) {
  const id = ptcg[e.code] ?? e.code;
  if (sets.some((s) => s.id === id)) codeOf.set(id, e.code);
}
for (const e of expansions) {
  const set = sets.find(
    (s) => !codeOf.has(s.id) && nameKey(s.name) === nameKey(e.name.replace(/^EX /, "")),
  );
  if (set) codeOf.set(set.id, e.code);
}

// Every linked group's printed numbers, read once.
const groupIds = new Set();
for (const link of Object.values(links)) {
  const group = link?.groupId ?? (link?.productId != null ? groupOf[link.productId] : undefined);
  if (group != null) groupIds.add(group);
}
const printedOfProduct = new Map();
await mapLimit([...groupIds], 8, async (groupId) => {
  const body = await fetchText(`https://tcgcsv.com/tcgplayer/3/${groupId}/products`, {
    json: true,
  });
  for (const p of body?.results ?? []) printedOfProduct.set(p.productId, printedNumberOfProduct(p));
});

const out = {};
for (const set of [...sets].sort((a, b) => a.id.localeCompare(b.id))) {
  const witness = paddingWitness(
    (set.cards ?? []).map((c) => ({ id: c.id, number: correctedNumber(c.id, c.localId) })),
  );
  if (!witness) continue;
  const code = codeOf.get(set.id);
  let scrydex = null;
  if (code) {
    const n = Number(witness.number);
    scrydex = scrydexPrintedNumber(
      (await fetchText(`https://scrydex.com/pokemon/cards/card/${code}-${n}`)) ?? "",
    );
    await sleep(1000);
  }
  const productId = links[witness.id]?.productId;
  out[set.id] = {
    card: witness.id,
    scrydex,
    tcgplayer: productId != null ? (printedOfProduct.get(productId) ?? null) : null,
  };
}

const read = Object.values(out);
console.log(
  `${read.length} sets: Scrydex answered ${read.filter((r) => r.scrydex).length}, TCGplayer ${read.filter((r) => r.tcgplayer).length}, neither ${read.filter((r) => !r.scrydex && !r.tcgplayer).length}`,
);
if (!DRY) writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
