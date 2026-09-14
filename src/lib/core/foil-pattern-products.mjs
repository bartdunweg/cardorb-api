/**
 * Which foil patterns a card really exists in, from TCGplayer's own products.
 *
 * Bart, 2026-09-14: "bij alles wat holo is kan ik foil pattern kiezen, maar dat is niet de
 * bedoeling, dat moet voor je worden geselecteerd". A form offered every pattern on every holo,
 * because TCGdex names the foil on a fraction of its cards and its silence was read as no answer.
 *
 * TCGplayer sells a pattern print as a product of its own beside the plain card: "Machamp 068/165
 * (Cosmos Holo)" next to "Machamp 068/165". Measured on 2026-09-14 across the 220 English groups:
 * 614 products say "(Cosmos Holo)", 101 "(Cracked Ice Holo)", and nearly all of them are not in the
 * card's own set group but in Miscellaneous Cards & Products (303), Prize Pack Series Cards (189),
 * Blister Exclusives (130) and Deck Exclusives (86). So a pattern product is matched to a card
 * across every group, by name and printed number together, never by name alone: a set has
 * same-named cards, and a name recurs across sets.
 *
 * - The key is the name with its parenthesised labels and trailing number taken off, beside
 *   TCGplayer's Number field with leading zeros dropped ("068/165" is "68/165").
 * - The candidates are the cards whose own linked product (tcgplayer-ids.generated.json) has that
 *   key. One in the pattern product's own group wins; otherwise, only for a number that carries its
 *   set's total ("68/165"), a candidate anywhere. A bare number ("025") only matches in its own
 *   group, since promo lines restart their numbering.
 * - More than one distinct product among the candidates is ambiguous and matches nothing.
 *
 * The patterned reverses that are a finish of their own (Poké Ball, Master Ball, Energy Symbol) are
 * matched the same way and kept apart, as `finishPrints`: TCGplayer sells each as a product with its
 * own price, and a copy records them in `finish`, not in `foilPattern` (finishOfName).
 *
 * Plain JavaScript, like price-basis.mjs, because scripts/tcgplayer-patterns.mjs builds the file
 * with it and a script cannot import TypeScript.
 */

/**
 * TCGplayer's words for a pattern, in this app's (FOIL_PATTERNS in collection-row.ts). Only the
 * two patterns the store can record and TCGplayer names: Water Web, Sheen, Wave, Mirage and the
 * rest have no word in FOIL_PATTERNS, and a pattern nobody can record is not offered.
 * "Cosmo Holo" and "Cosmo Foil" are TCGplayer's own spellings of cosmos (24 products).
 */
const PATTERN_WORDS = [
  [/\bcosmos?\b/i, "cosmos"],
  [/\bcracked ice\b/i, "cracked-ice"],
];

/**
 * The pattern a product's name carries in a parenthesised label, or null.
 *
 * @param {string} name
 * @returns {{ foilPattern: string, reverse: boolean } | null}
 */
export function patternOfName(name) {
  for (const m of name.matchAll(/\(([^()]*)\)/g)) {
    const label = m[1] ?? "";
    if (!/holo|foil|cracked ice/i.test(label)) continue;
    for (const [re, foilPattern] of PATTERN_WORDS)
      if (re.test(label)) return { foilPattern, reverse: /\breverse\b/i.test(label) };
  }
  return null;
}

/**
 * TCGplayer's labels for the patterned reverses a copy records as a finish (FINISHES in
 * collection-row.ts), each matched as the whole label so nothing that only shares a word counts.
 *
 * Measured on 2026-09-14 across the 220 English groups: "(Poke Ball Pattern)" 100 in Prismatic
 * Evolutions and 80 each in Black Bolt and White Flare, "(Master Ball Pattern)" 67, 72 and 72 in
 * the same three, "(Energy Symbol Pattern)" 140 and "(Poke Ball)" 34 in Ascended Heroes. Ascended
 * Heroes' other balls (Friend 23, Love 25, Quick 22, Dusk 26) have no finish in the store and are
 * not read; neither are "Great Ball League" and "Ultra Ball League", which are league stamps.
 */
const FINISH_LABELS = [
  [/^pok[eé] ?ball( pattern)?$/i, "poke-ball"],
  [/^master ?ball( pattern)?$/i, "master-ball"],
  [/^energy symbol( pattern)?$/i, "energy-symbol"],
];

/**
 * The patterned reverse finish a product's name carries in a parenthesised label, or null.
 *
 * @param {string} name
 * @returns {"poke-ball" | "master-ball" | "energy-symbol" | null}
 */
export function finishOfName(name) {
  for (const m of name.matchAll(/\(([^()]*)\)/g)) {
    const label = (m[1] ?? "").trim();
    for (const [re, finish] of FINISH_LABELS)
      if (re.test(label))
        return /** @type {"poke-ball" | "master-ball" | "energy-symbol"} */ (finish);
  }
  return null;
}

/**
 * The printing a patterned reverse's figure is filed under in tcgplayer_prices: its one priced
 * subtype, "holofoil" on the Scarlet & Violet sets and "reverse-holofoil" on Ascended Heroes.
 * "reverse-holofoil" where it has no price yet.
 *
 * @param {Iterable<string>} subtypes
 */
export function printingOfFinishPrint(subtypes) {
  const names = [...subtypes].map((s) => s.toLowerCase().replace(/\s+/g, "-"));
  return names.includes("reverse-holofoil")
    ? "reverse-holofoil"
    : ((names.includes("holofoil") ? "holofoil" : names[0]) ?? "reverse-holofoil");
}

/**
 * A product's name without labels or number, for comparing: "Iono - 185/193 (Cosmo Foil)" and
 * "Iono - 185/193" are both "iono".
 *
 * @param {string} name
 */
export const baseName = (name) =>
  name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^()]*\)/g, " ")
    .replace(/[’`]/g, "'")
    .replace(/\s+(-\s+)?[a-z]*\d+[a-z]*(\/[a-z]*\d+)?\s*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * TCGplayer's printed number without leading zeros, lower case; null where it has none.
 *
 * @param {{ extendedData?: { name: string, value: string }[] }} product
 */
export function numberOf(product) {
  const n = product.extendedData?.find((e) => e.name === "Number")?.value?.trim();
  if (!n) return null;
  return n
    .toLowerCase()
    .split("/")
    .map((part) => part.replace(/^0+(?=.)/, ""))
    .join("/");
}

/**
 * @param {{ name: string, extendedData?: { name: string, value: string }[] }} product
 * @returns {string | null}
 */
export function keyOf(product) {
  const n = numberOf(product);
  return n ? `${baseName(product.name)}|${n}` : null;
}

/**
 * The finish a pattern print is and the TCGplayer printing its price is filed under.
 *
 * TCGplayer's subtype is the truth where it has one: 746 of the 768 pattern products are priced as
 * "Holofoil", 15 as "Reverse Holofoil". A label that says reverse ("Reverse Cosmos Holo") is a
 * reverse whatever the price says. Unpriced, it is the holo its label names.
 *
 * @param {boolean} reverse
 * @param {Iterable<string>} subtypes tcgcsv's subTypeName values for the product
 * @returns {{ finish: "holo" | "reverse-holo", printing: string }}
 */
export function finishOfPrint(reverse, subtypes) {
  const names = new Set([...subtypes].map((s) => s.toLowerCase().replace(/\s+/g, "-")));
  if (reverse || (names.has("reverse-holofoil") && !names.has("holofoil")))
    return { finish: "reverse-holo", printing: "reverse-holofoil" };
  if (names.has("holofoil") || !names.size) return { finish: "holo", printing: "holofoil" };
  return { finish: "holo", printing: [...names][0] ?? "holofoil" };
}

/**
 * @typedef {{ productId: number, groupId: number, name: string, extendedData?: { name: string, value: string }[] }} Product
 * @typedef {{ foilPattern: string, finish: "holo" | "reverse-holo", productId: number, printing: string }} PatternPrint
 * @typedef {{ finish: "poke-ball" | "master-ball" | "energy-symbol", productId: number, printing: string }} FinishPrint
 * @typedef {{ standard?: false, prints: PatternPrint[], finishPrints?: FinishPrint[] }} CardPatterns
 */

/**
 * Every linked card's pattern prints, from one shelf's products.
 *
 * `standard: false` marks a card whose own linked product is itself a pattern print, with no plain
 * product of the same name and number in its group: the Tinkatink promo (svp-025) was only ever
 * the cosmos holo, so Standard is not a choice for it. Left out, a plain print exists.
 *
 * @param {Product[]} products every product of the shelf, every group
 * @param {Map<number, Iterable<string>>} subtypesOf productId to its priced subtype names
 * @param {Record<string, { productId?: number } | null>} links card id to its TCGplayer product
 * Beside them each card's patterned reverse finishes (finishOfName), matched by the same key and
 * rules. A finish print never sets `standard`: that says whether a plain print stands beside a
 * foil pattern, and a Poké Ball reverse is not one.
 *
 * @returns {{ cards: Record<string, CardPatterns>, unmatched: Product[], ambiguous: Product[] }}
 */
export function patternPrintsOf(products, subtypesOf, links) {
  /** @type {Map<number, string[]>} */
  const cardsOfProduct = new Map();
  for (const [id, link] of Object.entries(links)) {
    if (link?.productId == null) continue;
    cardsOfProduct.set(link.productId, [...(cardsOfProduct.get(link.productId) ?? []), id]);
  }
  /** Linked products by key, and every plain product by key and group. */
  const linkedByKey = new Map();
  const plainInGroup = new Set();
  for (const p of products) {
    const key = keyOf(p);
    if (!key) continue;
    if (!patternOfName(p.name) && !finishOfName(p.name)) plainInGroup.add(`${p.groupId}|${key}`);
    if (!cardsOfProduct.has(p.productId)) continue;
    linkedByKey.set(key, [...(linkedByKey.get(key) ?? []), p]);
  }

  /** @type {Record<string, CardPatterns>} */
  const cards = {};
  /** @type {Product[]} */
  const unmatched = [];
  /** @type {Product[]} */
  const ambiguous = [];
  /** @param {string} id @param {PatternPrint} print */
  const add = (id, print) => {
    const entry = (cards[id] ??= { prints: [] });
    if (!entry.prints.some((q) => q.productId === print.productId)) entry.prints.push(print);
  };
  /** @param {string} id @param {FinishPrint} print */
  const addFinish = (id, print) => {
    const entry = (cards[id] ??= { prints: [] });
    const list = (entry.finishPrints ??= []);
    if (!list.some((q) => q.productId === print.productId)) list.push(print);
  };
  /** The one card a pattern product with no card of its own belongs to, by key; null where none or several. */
  const cardProductOf = (p) => {
    const key = keyOf(p);
    const candidates = (key && linkedByKey.get(key)) || [];
    let picked = candidates.filter((c) => c.groupId === p.groupId);
    if (!picked.length && numberOf(p)?.includes("/")) picked = candidates;
    const distinct = [...new Set(picked.map((c) => c.productId))];
    if (distinct.length > 1) ambiguous.push(p);
    else if (distinct.length === 0) unmatched.push(p);
    return distinct.length === 1 ? distinct[0] : null;
  };

  for (const p of products) {
    const finish = finishOfName(p.name);
    if (finish) {
      const print = {
        finish,
        productId: p.productId,
        printing: printingOfFinishPrint(subtypesOf.get(p.productId) ?? []),
      };
      const owners = cardsOfProduct.get(p.productId);
      const product = owners ? null : cardProductOf(p);
      for (const id of owners ?? (product == null ? [] : (cardsOfProduct.get(product) ?? [])))
        addFinish(id, print);
      continue;
    }
    const pattern = patternOfName(p.name);
    if (!pattern) continue;
    const print = {
      foilPattern: pattern.foilPattern,
      ...finishOfPrint(pattern.reverse, subtypesOf.get(p.productId) ?? []),
      productId: p.productId,
    };
    const own = cardsOfProduct.get(p.productId);
    if (own) {
      const key = keyOf(p);
      for (const id of own) {
        add(id, print);
        if (!key || !plainInGroup.has(`${p.groupId}|${key}`)) cards[id].standard = false;
      }
      continue;
    }
    const product = cardProductOf(p);
    if (product != null) for (const id of cardsOfProduct.get(product) ?? []) add(id, print);
  }

  // Stable order, so the weekly run's diff is only what changed.
  const order = ["cosmos", "cracked-ice"];
  const finishOrder = ["poke-ball", "master-ball", "energy-symbol"];
  const sorted = /** @type {Record<string, CardPatterns>} */ ({});
  for (const id of Object.keys(cards).sort()) {
    const { standard, prints, finishPrints } = cards[id];
    prints.sort(
      (a, b) =>
        a.finish.localeCompare(b.finish) ||
        order.indexOf(a.foilPattern) - order.indexOf(b.foilPattern) ||
        a.productId - b.productId,
    );
    finishPrints?.sort(
      (a, b) =>
        finishOrder.indexOf(a.finish) - finishOrder.indexOf(b.finish) || a.productId - b.productId,
    );
    sorted[id] = {
      ...(standard === false ? { standard } : {}),
      prints,
      ...(finishPrints?.length ? { finishPrints } : {}),
    };
  }
  return { cards: sorted, unmatched, ambiguous };
}
