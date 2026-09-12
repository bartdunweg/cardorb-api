/**
 * Links the cards TCGdex relays no TCGplayer price for to TCGplayer's own products, via tcgcsv.
 *
 * TCGdex carries a product id under pricing.tcgplayer for most cards, and none at all for the
 * subsets and promo lines TCGplayer files as groups of their own: the Galarian Gallery, the
 * Trainer Galleries, the Shiny Vaults, every Black Star promo line. Measured on 2026-09-12, 217
 * of the owner's 1,609 held cards had no price for that reason alone, while TCGplayer prices
 * them (SVP 027 Pikachu, $21.45). tcgcsv publishes those groups, product by product, with the
 * printed number, so a card can be matched on the set it is in, its number and its name.
 *
 * Only the set-to-group pairs below, each read by hand: a group name is not a rule a script
 * should guess at. A product is taken when its number and its name both agree, and the plain one
 * where TCGplayer lists stamped variants beside it ("Pikachu - 027 (Pokemon Center Exclusive)").
 *
 * Writes into tcgplayer-ids.generated.json, the map every other TCGplayer read already uses (the
 * cron's weekly pass, backfill-card-prices.mjs), for cards that have no product there yet, and
 * adds `groupId`, which is how the live price asks tcgcsv for a card TCGdex does not price.
 * Never overwrites a product TCGdex gave.
 *
 * Runs too. TCGplayer files the Shadowless Base Set as a group of its own, where "Unlimited" is
 * the Shadowless run and "1st Edition" the stamped one, neither of which TCGdex relays. Those are
 * linked under `shadowless` beside the card's own product, and the collection reads that group's
 * printings as "shadowless", "shadowless-holofoil", "1st-edition" and "1st-edition-holofoil".
 *
 *   node scripts/tcgplayer-links.mjs [--dry]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const IDS = join(ROOT, "src", "lib", "core", "tcgplayer-ids.generated.json");
const DRY = process.argv.includes("--dry");

/** TCGdex set id to tcgcsv group name, category 3. Read by hand on 2026-09-12. */
const GROUPS = {
  "swsh12.5gg": "SWSH: Crown Zenith: Galarian Gallery",
  swsh9tg: "SWSH09: Brilliant Stars Trainer Gallery",
  swsh10tg: "SWSH10: Astral Radiance Trainer Gallery",
  swsh11tg: "SWSH11: Lost Origin Trainer Gallery",
  swsh12tg: "SWSH12: Silver Tempest Trainer Gallery",
  "swsh4.5sv": "Shining Fates: Shiny Vault",
  sma: "Hidden Fates: Shiny Vault",
  cel25cc: "Celebrations: Classic Collection",
  svp: "SV: Scarlet & Violet Promo Cards",
  swshp: "SWSH: Sword & Shield Promo Cards",
  smp: "SM Promos",
  xyp: "XY Promos",
  hgssp: "HGSS Promos",
  basep: "WoTC Promo",
  mep: "ME: Mega Evolution Promo",
};

/** TCGdex set id to the tcgcsv group that holds its Shadowless run. Read by hand on 2026-09-12. */
const RUN_GROUPS = {
  base1: "Base Set (Shadowless)",
};

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

/** "GG01", "TG01/TG30", "027", "SWSH001" and "1" read as the same kind of thing: prefix, number, suffix. */
const numberKey = (raw) => {
  const n = String(raw).split("/")[0].toUpperCase().replace(/\s+/g, "");
  const m = n.match(/^([A-Z]*)0*(\d+)([A-Z]*)$/);
  return m ? `${m[1]}|${Number(m[2])}|${m[3]}` : n;
};

/** Letters and digits only, accents off: "Flabébé" and "Flabebe" are one name. */
const fold = (s) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** tcgcsv's subtype name as TCGdex spells the same printing: "Reverse Holofoil" is "reverse-holofoil". */
const printingKey = (subType) => subType.toLowerCase().replace(/\s+/g, "-");

const ids = JSON.parse(readFileSync(IDS, "utf8"));
const { results: groups } = await fetchJson("https://tcgcsv.com/tcgplayer/3/groups");
const groupId = Object.fromEntries(groups.map((g) => [g.name, g.groupId]));

let linked = 0;
for (const [set, name] of Object.entries(GROUPS)) {
  const gid = groupId[name];
  if (!gid) {
    console.log(`${set}: no tcgcsv group named "${name}"`);
    continue;
  }
  const catalogue = await fetchJson(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(set)}`);
  const { results: products } = await fetchJson(`https://tcgcsv.com/tcgplayer/3/${gid}/products`);
  const { results: prices } = await fetchJson(`https://tcgcsv.com/tcgplayer/3/${gid}/prices`);
  const printings = new Map();
  for (const p of prices) {
    if (!(p.marketPrice > 0)) continue;
    printings.set(p.productId, [...(printings.get(p.productId) ?? []), printingKey(p.subTypeName)]);
  }
  const byNumber = new Map();
  for (const p of products) {
    const number = p.extendedData?.find((e) => e.name === "Number")?.value;
    if (!number) continue;
    const key = numberKey(number);
    byNumber.set(key, [...(byNumber.get(key) ?? []), p]);
  }
  let here = 0;
  let unmatched = 0;
  for (const card of catalogue?.cards ?? []) {
    if (ids[card.id]) continue;
    const named = (byNumber.get(numberKey(card.localId)) ?? []).filter((p) =>
      fold(p.name).startsWith(fold(card.name)),
    );
    // The plain product before a stamped or exclusive one of the same number and name.
    const product = named.find((p) => !p.name.includes("(")) ?? named[0];
    if (!product) {
      unmatched++;
      continue;
    }
    ids[card.id] = {
      productId: product.productId,
      variants: printings.get(product.productId) ?? [],
      groupId: gid,
    };
    here++;
  }
  linked += here;
  console.log(`${set} -> ${name}: ${here} linked, ${unmatched} left without a product`);
}

/** One group's products by number, and which printings each is priced as. */
async function groupIndex(gid) {
  const { results: products } = await fetchJson(`https://tcgcsv.com/tcgplayer/3/${gid}/products`);
  const { results: prices } = await fetchJson(`https://tcgcsv.com/tcgplayer/3/${gid}/prices`);
  const printings = new Map();
  for (const p of prices) {
    if (!(p.marketPrice > 0)) continue;
    printings.set(p.productId, [...(printings.get(p.productId) ?? []), printingKey(p.subTypeName)]);
  }
  const byNumber = new Map();
  for (const p of products) {
    const number = p.extendedData?.find((e) => e.name === "Number")?.value;
    if (!number) continue;
    const key = numberKey(number);
    byNumber.set(key, [...(byNumber.get(key) ?? []), p]);
  }
  return { byNumber, printings };
}

let runs = 0;
for (const [set, name] of Object.entries(RUN_GROUPS)) {
  const gid = groupId[name];
  if (!gid) {
    console.log(`${set}: no tcgcsv group named "${name}"`);
    continue;
  }
  const catalogue = await fetchJson(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(set)}`);
  const { byNumber } = await groupIndex(gid);
  let here = 0;
  let unmatched = 0;
  for (const card of catalogue?.cards ?? []) {
    // A run is linked beside the card's own product; a card with none has nothing to sit beside.
    if (!ids[card.id]) continue;
    const named = (byNumber.get(numberKey(card.localId)) ?? []).filter((p) =>
      fold(p.name).startsWith(fold(card.name)),
    );
    const product = named.find((p) => !p.name.includes("(")) ?? named[0];
    if (!product) {
      unmatched++;
      continue;
    }
    ids[card.id] = { ...ids[card.id], shadowless: { productId: product.productId, groupId: gid } };
    here++;
  }
  runs += here;
  console.log(`${set} -> ${name}: ${here} Shadowless runs linked, ${unmatched} without one`);
}
console.log(`${DRY ? "Would link" : "Linked"} ${runs} Shadowless runs.`);

if (!DRY) {
  const sorted = Object.fromEntries(
    Object.keys(ids)
      .sort()
      .map((k) => [k, ids[k]]),
  );
  writeFileSync(IDS, `${JSON.stringify(sorted, null, 2)}\n`);
}
console.log(`${DRY ? "Would link" : "Linked"} ${linked} cards.`);
