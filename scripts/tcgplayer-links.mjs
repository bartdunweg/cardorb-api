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

/**
 * Groups TCGplayer files cards of many sets in, under each card's own set number: Machamp 8/102 in
 * "Deck Exclusives", Shaymin EX 77a/108 in "Alternate Art Promos" (Bart's own cards, 2026-09-12). A
 * card is taken from one only when the number's total is the set's own count as well, so a
 * Charizard 4/102 there can only ever be Base Set's.
 */
const BUCKET_GROUPS = new Set([
  "Deck Exclusives",
  "Alternate Art Promos",
  // Pokémon Futsal's five "on the Ball" promos, "001/005 (Pokemon Futsal)".
  "Miscellaneous Cards & Products",
]);

/**
 * Words in a product name that mark a variant rather than the card: WotC Promo 1 is both "Pikachu (1)"
 * at $46.54 and "Pikachu (1) (Misprint)" with no price, and taking the first by name linked the
 * misprint (2026-09-12).
 */
const VARIANT = /misprint|error|prerelease|staff|jumbo|oversized|exclusive|stamped/i;

/**
 * The product to take among several with the card's name and number in one group: a plain one
 * before a variant, one whose name carries the card's number ("Pikachu (1)", "Eevee - 11/12")
 * before one that does not, one with a market price before one without, fewer brackets before
 * more. Measured on 2026-09-12: ranking by price first swapped a Participation promo for its Staff
 * print and one Pikachu for another.
 */
const pick = (hits, localId) => {
  const n = String(Number(String(localId).replace(/\D/g, "")) || localId);
  const carriesNumber = (name) =>
    new RegExp(`\\(\\s*0*${n}\\s*\\)|\\s-\\s*[A-Z]*0*${n}\\b`, "i").test(name);
  const key = ({ product }) => [
    Number(VARIANT.test(product.name)),
    Number(!carriesNumber(product.name)),
    Number(!printingsOf.has(product.productId)),
    product.name.match(/[([]/g)?.length ?? 0,
  ];
  return [...hits].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  })[0];
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

/** The "/108" of "077a/108", or null. */
const numberTotal = (raw) => {
  const m = String(raw).match(/\/\s*0*(\d+)\s*$/);
  return m ? Number(m[1]) : null;
};

/**
 * Letters and digits only, accents off: "Flabébé" and "Flabebe" are one name. The gender signs are
 * the letters TCGplayer writes for them, so TCGdex's "Nidoran♀" is its "Nidoran F".
 */
const fold = (s) =>
  s
    .replace(/♀/g, "F")
    .replace(/♂/g, "M")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** A product's card name, without TCGplayer's suffixes: " - 027", " (Pokemon Center Exclusive)", " [Staff]". */
const baseName = (productName) => productName.replace(/\s*[([].*$/, "").split(" - ")[0];

/** TCGplayer's one-letter energy types: "Unit Energy GRW" is Grass, Fire and Water. */
const TYPE_LETTER = {
  grass: "G",
  fire: "R",
  water: "W",
  lightning: "L",
  psychic: "P",
  fighting: "F",
  darkness: "D",
  metal: "M",
  fairy: "Y",
  dragon: "N",
  colorless: "C",
};
const TYPES = "Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Dragon|Colorless";

/**
 * A TCGdex card name as TCGplayer may spell it. Each rule was read off the English cards the linker
 * could not place on 2026-09-12: "Cyrus ◇" is "Cyrus Prism Star", "Mudkip ☆" is "Mudkip Star",
 * "Mew ☆ δ" is "Mew Star (Delta Species)", "Impostor Professor Oak" is "Imposter", "Unit Energy
 * GrassFireWater" is "Unit Energy GRW", "Fairy Charm Grass" is "Fairy Charm G", "Head Ringer Team
 * Flare Hyper Gear" is "Head Ringer", "Professor's Research (Professor Magnolia)" is "Professor's
 * Research".
 */
const cardNames = (name) => {
  const n = name
    .replace(/◇/g, " Prism Star")
    .replace(/☆/g, " Star")
    .replace(/δ/g, " Delta Species")
    .replace(/\bImpostor\b/gi, "Imposter");
  const out = new Set([
    n,
    n.replace(/\s+Team Flare (Hyper )?Gear$/i, ""),
    n.replace(/\s*\(.*\)\s*$/, ""),
  ]);
  const typed = n.match(
    new RegExp(`^(.*\\b(?:Energy|Charm))\\s+((?:${TYPES})(?:\\s*(?:${TYPES}))*)$`, "i"),
  );
  if (typed) {
    const letters = typed[2]
      .match(new RegExp(TYPES, "gi"))
      .map((t) => TYPE_LETTER[t.toLowerCase()]);
    out.add(`${typed[1]} ${letters.join("")}`);
  }
  return [...out];
};

/** A TCGplayer product name without what it adds: "Basic ", " LV.X", " -BW47", " - 027", suffixes. */
const productNames = (productName) => {
  const out = new Set([baseName(productName), productName.split(" - ")[0]]);
  for (const x of [...out]) {
    out.add(x.replace(/^Basic\s+/i, ""));
    out.add(x.replace(/\s+LV\.?X$/i, ""));
    out.add(x.replace(/\s*-\s*[A-Z]*\d+[a-z]?(\/\d+)?$/, ""));
  }
  return [...out];
};

/** Whether a product is this card by name, by the spellings above. */
const sameName = (productName, cardName) => {
  const product = new Set(productNames(productName).map(fold));
  return cardNames(cardName).some((n) => product.has(fold(n)));
};

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
const nameOfProduct = new Map();
/** Every product by each spelling of its name, for a card whose number TCGplayer writes differently. */
const byName = new Map();
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
    nameOfProduct.set(p.productId, p.name);
    const number = p.extendedData?.find((e) => e.name === "Number")?.value;
    for (const spelling of new Set(productNames(p.name).map(fold))) {
      const list = byName.get(spelling);
      const hit = { group: g, product: p, number: number ?? null };
      if (list) list.push(hit);
      else byName.set(spelling, [hit]);
    }
    if (!number) continue;
    const key = numberKey(number);
    byNumber.set(key, [
      ...(byNumber.get(key) ?? []),
      { group: g, product: p, total: numberTotal(number) },
    ]);
  }
});
console.log(`tcgcsv: ${groups.length} groups, ${printingsOf.size} priced products`);

// The sets that hold a card with no product, read once each.
const unlinkedSets = [
  ...new Set(
    Object.keys(ids)
      .filter((id) => !ids[id] || ids[id].groupId != null)
      .map((id) => id.slice(0, id.lastIndexOf("-"))),
  ),
];
const catalogues = await mapLimit(unlinkedSets, 6, async (set) => [
  set,
  await fetchJson(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(set)}`),
]);

const coverage = {};
const digitalSets = [];
let removed = 0;
let linked = 0;
for (const [set, catalogue] of catalogues) {
  if (catalogue && DIGITAL_SERIES.has(catalogue.serie?.id)) digitalSets.push(set);
  // A set TCGdex no longer lists (swsh9.5tg and three more, 74 ids on 2026-09-12): its cards are
  // not cards anybody can hold, so their empty entries leave the map rather than count as unlinked.
  if (catalogue === null) {
    for (const id of Object.keys(ids)) {
      if (ids[id] === null && id.slice(0, id.lastIndexOf("-")) === set) {
        delete ids[id];
        removed++;
      }
    }
    continue;
  }
  if (DIGITAL_SERIES.has(catalogue.serie?.id)) continue;
  const setWords = words(catalogue.name);
  // The groups TCGdex's own links for this set are in: its home, where it has one.
  const homes = new Map();
  for (const card of catalogue.cards ?? []) {
    const link = ids[card.id];
    // TCGdex's own links only: a link this script made is not evidence of where the set lives.
    const group = link && link.groupId == null && groupOfProduct.get(link.productId);
    if (group) homes.set(group.groupId, group.name);
  }
  const ownGroup = (group) =>
    homes.has(group.groupId) ||
    [...homes.values()].some((home) => group.name.startsWith(`${home}: `));
  const row = { name: catalogue.name, linked: 0, ambiguous: 0, notFound: 0 };
  for (const card of catalogue.cards ?? []) {
    // Unlinked cards, and this script's own earlier links to a product that is plainly a variant
    // and has no price (the Pikachu misprint), which a better pick corrects. Never a product TCGdex
    // gave, never a link that prices the card, and never an unpriced product that is simply another
    // print of the promo (a Victory Cup from another season): which one the card is, is not ours
    // to guess.
    const previous = ids[card.id];
    if (
      previous !== null &&
      (previous?.groupId == null ||
        printingsOf.has(previous.productId) ||
        !VARIANT.test(nameOfProduct.get(previous.productId) ?? ""))
    )
      continue;
    const named = (byNumber.get(numberKey(card.localId)) ?? []).filter(({ product }) =>
      sameName(product.name, card.name),
    );
    // A link this script made keeps its group: only the product inside it is chosen again. Asked
    // to find the group afresh, WotC Promo 1 went looking by words and landed on another Pikachu.
    if (previous?.groupId != null) {
      const same = named.filter((h) => h.group.groupId === previous.groupId);
      const { product } = same.length ? pick(same, card.localId) : { product: null };
      if (product && product.productId !== previous.productId) {
        ids[card.id] = {
          ...previous,
          productId: product.productId,
          variants: printingsOf.get(product.productId) ?? [],
        };
        row.linked++;
        linked++;
      }
      continue;
    }
    // A group of many sets counts as this set's own when the printed total is the set's count.
    const setCount = catalogue.cardCount?.official ?? null;
    const bucket = (hit) =>
      BUCKET_GROUPS.has(hit.group.name) && setCount != null && hit.total === setCount;
    // Only groups whose name shares a word with the set's, the closest of those, and only one.
    const scored = new Map();
    for (const hit of named) {
      const shared = bucket(hit)
        ? 1
        : BUCKET_GROUPS.has(hit.group.name)
          ? 0
          : homes.size
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
    if ((!named.length || !ranked.length) && previous === null) {
      /*
       * The number written another way. Celebrations' Classic Collection is "CC002" at TCGdex and
       * "4/102" at TCGplayer; My First Battle's products carry no number at all. So a card may be
       * taken by name alone, and only where that cannot pick a different printing: the product
       * has no number, or a plain one against the card's code ("4/102" for "CC002"), it is in
       * the set's own group (as above), and it is the only plain product of that name there.
       */
      const prefix = numberKey(card.localId).split("|")[0];
      const byGroup = new Map();
      for (const spelling of new Set(cardNames(card.name).map(fold))) {
        for (const hit of byName.get(spelling) ?? []) {
          if (BUCKET_GROUPS.has(hit.group.name) || VARIANT.test(hit.product.name)) continue;
          // Another way of writing the number is a product with none, or a plain number against a
          // card's code ("4/102" for "CC002"). Two different codes are two different promo lines:
          // a BW promo Raichu is not "Raichu - DP21".
          if (hit.number != null) {
            const productPrefix = numberKey(hit.number).split("|")[0];
            if (!(prefix && !productPrefix)) continue;
          }
          const entry = byGroup.get(hit.group.groupId) ?? { group: hit.group, products: new Map() };
          entry.products.set(hit.product.productId, hit.product);
          byGroup.set(hit.group.groupId, entry);
        }
      }
      const own = [...byGroup.values()]
        .map((e) => ({
          ...e,
          shared: homes.size
            ? ownGroup(e.group)
              ? 1
              : 0
            : [...words(e.group.name)].filter((w) => setWords.has(w)).length,
        }))
        .filter((e) => e.shared > 0)
        .sort((a, b) => b.shared - a.shared);
      const top = own[0];
      if (top && (own.length === 1 || own[1].shared < top.shared) && top.products.size === 1) {
        const [product] = top.products.values();
        ids[card.id] = {
          productId: product.productId,
          variants: printingsOf.get(product.productId) ?? [],
          groupId: top.group.groupId,
        };
        row.linked++;
        linked++;
        continue;
      }
      row.notFound++;
      continue;
    }
    if (!named.length || !ranked.length) continue;
    if (ranked.length > 1 && ranked[0].shared === ranked[1].shared) {
      if (previous === null) row.ambiguous++;
      continue;
    }
    const hits = ranked[0].hits;
    const { product, group } = pick(hits, card.localId);
    if (previous?.productId === product.productId) continue;
    ids[card.id] = {
      ...previous,
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
        sameName(h.product.name, card.name) &&
        (h.group.groupId === group.groupId ||
          // TCGplayer files a few Shadowless cards with the deck they came in: "Machamp - 8/102
          // (Base Set Shadowless)" is in Deck Exclusives.
          (BUCKET_GROUPS.has(h.group.name) &&
            /shadowless/i.test(h.product.name) &&
            h.total === 102)),
    );
    const hit = hits.length ? pick(hits, card.localId) : undefined;
    if (!hit) continue;
    ids[card.id] = {
      ...ids[card.id],
      shadowless: { productId: hit.product.productId, groupId: hit.group.groupId },
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
console.log(`Removed ${removed} empty ids of sets TCGdex no longer lists.`);
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
