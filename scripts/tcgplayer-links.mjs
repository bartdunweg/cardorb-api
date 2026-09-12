/**
 * Links the cards TCGdex relays no TCGplayer price for to TCGplayer's own products, via tcgcsv,
 * and reports what is still unlinked.
 *
 * TCGdex carries a TCGplayer product id for most cards, and none for the subsets and promo lines
 * TCGplayer files as groups of their own. tcgcsv publishes every group, product by product, with
 * the printed number, so a card can be matched on its name and its number.
 *
 * Every group, not a list of them. The first version of this script searched the groups it was
 * told to, one per set, read by hand; every group nobody thought of was a card with no price and
 * no warning, and Bart found Jirachi XY67a ($257.56) by opening TCGplayer himself: it is filed
 * in "Alternate Art Promos", not beside XY67. So a card is matched against all of TCGplayer's
 * English products, and taken only when it is unambiguous:
 *
 *   - the printed number agrees ("GG01", "TG01/TG30", "027", "XY67a" read as prefix, number, suffix)
 *   - the name agrees exactly, once TCGplayer's own suffixes are off ("Pikachu - 027 (Pokemon
 *     Center Exclusive)" is Pikachu, "Latias (Delta Species)" is Latias)
 *   - the group is the set's own. Where TCGdex already linked some of the set's cards, those
 *     cards' groups are its home, and a group is the set's own when it is a home or a subgroup
 *     of one, which TCGplayer names "Home: Subset" ("Generations: Radiant Collection"). Measured
 *     on 2026-09-12, looser rules linked wrongly: word overlap put a Dragon Frontiers card in
 *     EX Dragon, and a shared-words subgroup test put a Sun & Moon card in "SM - Guardians
 *     Rising" (the home "SM Base Set" is only "sm" once "base" and "set" are set aside).
 *     A set with no linked card at all (the promo lines) has no home, and there the group must
 *     share a word with the set's name and share more than any other group does
 *
 * Anything else is left unlinked and counted in the report, never guessed. Within a group the
 * plain product wins over a stamped or exclusive one of the same number and name.
 *
 * Writes tcgplayer-ids.generated.json for cards with no product there yet (adding `groupId`, which
 * is how the live price asks tcgcsv), never overwriting a product TCGdex gave; and
 * tcgplayer-coverage.json, the count verify.sh holds the line on. Pokémon TCG Pocket's sets are
 * digital and are not counted.
 *
 * Runs too: TCGplayer files the Shadowless Base Set as a group of its own, where "Unlimited" is
 * the Shadowless run and "1st Edition" the stamped one. Those are linked under `shadowless`.
 *
 *   node scripts/tcgplayer-links.mjs [--dry]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const IDS = join(ROOT, "src", "lib", "core", "tcgplayer-ids.generated.json");
const COVERAGE = join(ROOT, "scripts", "tcgplayer-coverage.json");
const DRY = process.argv.includes("--dry");

/** TCGdex set id to the tcgcsv group that holds its Shadowless run. Read by hand on 2026-09-12. */
const RUN_GROUPS = {
  base1: "Base Set (Shadowless)",
};

/** TCGdex's series for Pokémon TCG Pocket: digital cards, which no market sells. */
const DIGITAL_SERIES = new Set(["tcgp"]);

/** Words a set name and a group name share without it meaning they are the same set. */
const COMMON = new Set([
  "the",
  "and",
  "set",
  "pokemon",
  "series",
  "card",
  "cards",
  "collection",
  "base",
]);

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

/** "GG01", "TG01/TG30", "027", "SWSH001", "XY67a" and "1" read as prefix, number and suffix. */
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

/** A product's card name, without TCGplayer's suffixes: " - 027", " (Pokemon Center Exclusive)", " [Staff]". */
const baseName = (productName) => productName.replace(/\s*[([].*$/, "").split(" - ")[0];

/** The words of a set or group name that could identify it. */
const words = (name) =>
  new Set(
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 2 && !COMMON.has(w)),
  );

/** tcgcsv's subtype name as TCGdex spells the same printing: "Reverse Holofoil" is "reverse-holofoil". */
const printingKey = (subType) => subType.toLowerCase().replace(/\s+/g, "-");

const ids = JSON.parse(readFileSync(IDS, "utf8"));
const { results: groups } = await fetchJson("https://tcgcsv.com/tcgplayer/3/groups");

// Every English product, by number, with its group and the printings it is priced as.
const byNumber = new Map();
const printingsOf = new Map();
const groupOfProduct = new Map();
await mapLimit(groups, 8, async (g) => {
  const [products, prices] = await Promise.all([
    fetchJson(`https://tcgcsv.com/tcgplayer/3/${g.groupId}/products`),
    fetchJson(`https://tcgcsv.com/tcgplayer/3/${g.groupId}/prices`),
  ]);
  for (const p of prices?.results ?? []) {
    if (!(p.marketPrice > 0)) continue;
    printingsOf.set(p.productId, [
      ...(printingsOf.get(p.productId) ?? []),
      printingKey(p.subTypeName),
    ]);
  }
  for (const p of products?.results ?? []) {
    groupOfProduct.set(p.productId, g);
    const number = p.extendedData?.find((e) => e.name === "Number")?.value;
    if (!number) continue;
    const key = numberKey(number);
    byNumber.set(key, [...(byNumber.get(key) ?? []), { group: g, product: p }]);
  }
});
console.log(`tcgcsv: ${groups.length} groups, ${printingsOf.size} priced products`);

// The sets that hold a card with no product, read once each.
const unlinkedSets = [
  ...new Set(
    Object.keys(ids)
      .filter((id) => !ids[id])
      .map((id) => id.slice(0, id.lastIndexOf("-"))),
  ),
];
const catalogues = await mapLimit(unlinkedSets, 6, async (set) => [
  set,
  await fetchJson(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(set)}`),
]);

const coverage = {};
const digitalSets = [];
let linked = 0;
for (const [set, catalogue] of catalogues) {
  if (catalogue && DIGITAL_SERIES.has(catalogue.serie?.id)) digitalSets.push(set);
  if (!catalogue || DIGITAL_SERIES.has(catalogue.serie?.id)) continue;
  const setWords = words(catalogue.name);
  // The groups TCGdex's own links for this set are in: its home, where it has one.
  const homes = new Map();
  for (const card of catalogue.cards ?? []) {
    const link = ids[card.id];
    const group = link && groupOfProduct.get(link.productId);
    if (group) homes.set(group.groupId, group.name);
  }
  const ownGroup = (group) =>
    homes.has(group.groupId) ||
    [...homes.values()].some((home) => group.name.startsWith(`${home}: `));
  const row = { name: catalogue.name, linked: 0, ambiguous: 0, notFound: 0 };
  for (const card of catalogue.cards ?? []) {
    if (ids[card.id] !== null) continue;
    const named = (byNumber.get(numberKey(card.localId)) ?? []).filter(
      ({ product }) => fold(baseName(product.name)) === fold(card.name),
    );
    // Only groups whose name shares a word with the set's, the closest of those, and only one.
    const scored = new Map();
    for (const hit of named) {
      const shared = homes.size
        ? ownGroup(hit.group)
          ? 1
          : 0
        : [...words(hit.group.name)].filter((w) => setWords.has(w)).length;
      if (shared)
        scored.set(hit.group.groupId, {
          shared,
          hits: [...(scored.get(hit.group.groupId)?.hits ?? []), hit],
        });
    }
    const ranked = [...scored.values()].sort((a, b) => b.shared - a.shared);
    if (!named.length || !ranked.length) {
      row.notFound++;
      continue;
    }
    if (ranked.length > 1 && ranked[0].shared === ranked[1].shared) {
      row.ambiguous++;
      continue;
    }
    const hits = ranked[0].hits;
    const { product, group } = hits.find(({ product: p }) => !/[([]/.test(p.name)) ?? hits[0];
    ids[card.id] = {
      productId: product.productId,
      variants: printingsOf.get(product.productId) ?? [],
      groupId: group.groupId,
    };
    row.linked++;
    linked++;
  }
  if (row.linked || row.ambiguous || row.notFound) coverage[set] = row;
}

// The Shadowless runs, beside each card's own product.
let runs = 0;
for (const [set, name] of Object.entries(RUN_GROUPS)) {
  const group = groups.find((g) => g.name === name);
  if (!group) {
    console.log(`${set}: no tcgcsv group named "${name}"`);
    continue;
  }
  const catalogue = await fetchJson(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(set)}`);
  for (const card of catalogue?.cards ?? []) {
    if (!ids[card.id]) continue;
    const hits = (byNumber.get(numberKey(card.localId)) ?? []).filter(
      (h) =>
        h.group.groupId === group.groupId && fold(baseName(h.product.name)) === fold(card.name),
    );
    const hit = hits.find(({ product: p }) => !/[([]/.test(p.name)) ?? hits[0];
    if (!hit) continue;
    ids[card.id] = {
      ...ids[card.id],
      shadowless: { productId: hit.product.productId, groupId: group.groupId },
    };
    runs++;
  }
}

const totals = Object.values(coverage).reduce(
  (t, r) => ({
    linked: t.linked + r.linked,
    ambiguous: t.ambiguous + r.ambiguous,
    notFound: t.notFound + r.notFound,
  }),
  { linked: 0, ambiguous: 0, notFound: 0 },
);
console.log(
  `Linked ${linked} cards and ${runs} Shadowless runs. Left: ${totals.ambiguous} ambiguous, ${totals.notFound} not found.`,
);
for (const [set, r] of Object.entries(coverage)
  .sort((a, b) => b[1].ambiguous + b[1].notFound - (a[1].ambiguous + a[1].notFound))
  .slice(0, 12)) {
  if (r.ambiguous + r.notFound)
    console.log(`  ${set} (${r.name}): ${r.ambiguous} ambiguous, ${r.notFound} not found`);
}

if (!DRY) {
  const sorted = Object.fromEntries(
    Object.keys(ids)
      .sort()
      .map((k) => [k, ids[k]]),
  );
  writeFileSync(IDS, `${JSON.stringify(sorted, null, 2)}\n`);
  // What is left: the line verify.sh holds (scripts/check-tcgplayer-coverage.mjs). `unlinked` counts
  // every card in the map with no product, outside the digital sets, which is what the check
  // recounts offline; the per-set rows say where they are.
  const digital = new Set(digitalSets);
  const unlinked = Object.keys(sorted).filter(
    (id) => sorted[id] === null && !digital.has(id.slice(0, id.lastIndexOf("-"))),
  ).length;
  // Per set, from the map itself, so the rows add up to `unlinked`: a card TCGdex's set listing no
  // longer carries is still a card with no price. Names where this run read the set.
  const names = Object.fromEntries(catalogues.map(([set, c]) => [set, c?.name ?? null]));
  const left = {};
  for (const id of Object.keys(sorted)) {
    const set = id.slice(0, id.lastIndexOf("-"));
    if (sorted[id] !== null || digital.has(set)) continue;
    left[set] ??= { name: names[set] ?? null, unlinked: 0 };
    left[set].unlinked++;
  }
  writeFileSync(
    COVERAGE,
    `${JSON.stringify({ unlinked, digitalSets: digitalSets.sort(), sets: left }, null, 2)}\n`,
  );
}
