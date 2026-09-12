/**
 * The Cardmarket product id of a card's print runs, where the catalogue names one.
 *
 *   node scripts/cardmarket-ids-editions.mjs            # every English set, print what it found
 *   node scripts/cardmarket-ids-editions.mjs --write    # write the map
 *   node scripts/cardmarket-ids-editions.mjs --write base1 base2
 *
 * ── Why this exists ──
 *
 * A copy says which run it is from (`cards.edition`) and was priced as the ordinary run whatever
 * it said, because the map beside this one (cardmarket-ids.generated.json) holds one product per
 * card: the card-level `pricing.cardmarket.idProduct`, which is the unlimited print.
 *
 * Cardmarket does price the runs apart. It files a Shadowless Base Set card as a product of its
 * own, and its own nightly guide — the file this API already reads for every price it shows —
 * carries that product's figures. What is not in the guide is which product is which run: the
 * guide is a list of ids and numbers with no card in it. TCGdex has the link, per variant, in
 * `variants_detailed[].thirdParty.cardmarket` beside a `subtype`.
 *
 * Measured 2026-09-12, base1 through neo1: Base Set is the one set whose runs Cardmarket prices,
 * every card of it, and base1-4 Charizard reads €3,567 trend as Shadowless against €583 as
 * unlimited. Six times. The other classic sets have subtypes with no product ("1999-2000
 * copyright", "missing expansion symbol"), which is the catalogue describing a print run nobody
 * sells apart, and those are left out: a subtype with no product is nothing to price.
 *
 * One request per card, as the sibling script does, and for the same reason: the product ids only
 * appear when the card itself is asked for. Re-runnable, and what is already known is kept, so a
 * second run asks about the cards added since the first. Written per set, so a run that dies
 * halfway keeps what it learned.
 *
 * English only. The runs are an English-era fact: no Japanese set had a stamped run, and the
 * other shelves have no subtype with a product at all.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// The segments spelled out in the join, which is the shape scripts/generated-paths.test.ts
// resolves: four scripts once named a file that had moved and only died after the requests.
const FILE = join(ROOT, "src", "lib", "core", "cardmarket-ids.editions.generated.json");
const HOST = "https://api.tcgdex.net/v2";

const args = process.argv.slice(2);
const write = args.includes("--write");
const only = args.filter((a) => !a.startsWith("--"));

async function json(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "cardorb.com" } });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
    } catch {
      /* the catalogue refuses a share of requests; a retry is the answer */
    }
    await new Promise((r) => setTimeout(r, 250 * attempt));
  }
  return null;
}

async function mapLimit(items, limit, fn) {
  let at = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (at < items.length) await fn(items[at++]);
    }),
  );
}

/** What the catalogue calls a run, as this app names it. Only runs somebody can be sold. */
const EDITION_OF = { shadowless: "shadowless", "shadowless-red-cheek": "shadowless" };

const known = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
/** Cards asked about and found to have no run of their own, so a re-run does not ask again. */
const asked = new Set(Object.keys(known));

const sets = only.length ? only.map((id) => ({ id })) : ((await json(`${HOST}/en/sets`)) ?? []);
if (!sets.length) {
  console.error("The catalogue answered no sets.");
  process.exit(1);
}

let found = 0;
for (const { id } of sets) {
  const set = await json(`${HOST}/en/sets/${encodeURIComponent(id)}`);
  const ids = (set?.cards ?? []).map((c) => c.id).filter((c) => !asked.has(c));
  if (!ids.length) continue;
  process.stdout.write(`${id}: ${ids.length} to ask about… `);
  let here = 0;
  await mapLimit(ids, 8, async (cardId) => {
    const card = await json(`${HOST}/en/cards/${encodeURIComponent(cardId)}`);
    asked.add(cardId);
    const runs = {};
    for (const v of card?.variants_detailed ?? []) {
      const edition = EDITION_OF[v?.subtype];
      const product = v?.thirdParty?.cardmarket;
      // The first product wins: a subtype is listed once per variant type (holo, normal), and
      // Cardmarket files one product for the card, not one per finish.
      if (edition && typeof product === "number" && runs[edition] == null) runs[edition] = product;
    }
    // An empty object, not a skip: it says this card was asked about and has no run of its own.
    known[cardId] = runs;
    here += Object.keys(runs).length ? 1 : 0;
  });
  found += here;
  console.log(`${here} with a run of their own.`);
  if (write) save();
}

function save() {
  /*
   * Only the cards that have a run of their own. The sibling map keeps its nulls so a re-run
   * does not ask again, and can: it is one number per card. This one would be 23,548 empty
   * objects for the 102 cards that answer, and it is imported into the server bundle. So a
   * re-run asks about every card again, which is half an hour of a script nobody waits on, and
   * what ships is the answer rather than the asking.
   *
   * Sorted, so a re-run's diff is the cards that were added and nothing else.
   */
  const found = Object.fromEntries(
    Object.keys(known)
      .sort()
      .filter((k) => Object.keys(known[k]).length)
      .map((k) => [k, known[k]]),
  );
  writeFileSync(FILE, `${JSON.stringify(found, null, 2)}\n`);
}

const withRuns = Object.values(known).filter((r) => Object.keys(r).length).length;
console.log(`${found} new, ${withRuns} of ${Object.keys(known).length} cards have a priced run.`);
if (!write) console.log("Nothing written. Re-run with --write.");
