/**
 * Fill the Cardmarket product ids TCGdex does not link, from Cardmarket's own product list.
 *
 *   node scripts/cardmarket-ids-fill.mjs          # print what it would set, and what it cannot decide
 *   node scripts/cardmarket-ids-fill.mjs --write  # set the sure ones in lib/core/cardmarket-ids.generated.json
 *   node scripts/cardmarket-ids-fill.mjs --audit  # check the links that are already there, and exit 1 on a bad one
 *
 * ── Why this exists ──
 *
 * A card is priced from Cardmarket's daily guide through its product id, and the id comes from
 * TCGdex (snapshot-collection-value.mjs writes it into the id map). TCGdex has no id for a
 * few dozen of the collection's cards, old promos mostly, and a null there was the end of it:
 * the guide could not price the card, TCGdex's own pricing block was empty for the same reason,
 * and only TCGplayer stood between the card and "no price". On 2026-09-06 that was how
 * Yveltal-EX XY150a, the Wizards promo Pikachu and Ancient Mew went unpriced for a week.
 *
 * Cardmarket publishes its product list, and every card the collection already links tells
 * which Cardmarket expansion a set is: so for a null id, look in that expansion for a product
 * with the card's name. One match is set; several (a card printed three times in one promo
 * set) are printed with their guide prices, for a person to pick by hand — the product page's
 * URL ends in the version (V3) and that is the order the products carry here.
 *
 * Run it after snapshot-collection-value.mjs has added new ids, or whenever the unpriced list
 * on /dashboard/cards?unpriced=1 is not empty.
 *
 * ── The audit ──
 *
 * The same knowledge, read backwards. --audit takes the links that are already in the map and
 * asks whether each product sits in the expansion its set is, which is the one thing a name
 * match cannot check for itself. Venusaur EX XY28 read €116.93 for months off a Japanese card
 * by the same name, in an expansion holding Victory Ring and MSwampert EX, because nothing
 * ever asked (#341).
 *
 * It cannot live in the test suite beside the collision check: it needs their 13MB catalogue
 * and a test may not fetch. So it is a command, and it exits 1 when it finds one, which is
 * what makes it usable from CI on a schedule rather than only by hand.
 *
 * ── A set nobody has linked a card in ──
 *
 * Since the English map holds the whole shelf (2026-09-11, language-cardmarket-ids.mjs), a
 * set can be unlinked from top to bottom — Gym Heroes, Gym Challenge, the XY trainer kits —
 * and then no card in it says which expansion it is. Those are found the other way round:
 * the expansion whose products carry the most of the set's own card names is the set, when
 * it carries at least half of them and clearly more than the runner-up. A set from the
 * Pokémon TCG Pocket app (A1, B2a, …) is skipped outright: there is no physical card, so
 * there is no product, and a null there is the right answer.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const IDS = join(ROOT, "lib", "core", "cardmarket-ids.generated.json");
const PRODUCTS =
  "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json";
const GUIDE = "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json";

const write = process.argv.includes("--write");
const audit = process.argv.includes("--audit");

/** @type {Record<string, number | null>} */
const ids = JSON.parse(readFileSync(IDS, "utf8"));
const missing = Object.keys(ids).filter((id) => ids[id] === null);
if (!missing.length && !audit) {
  console.log("Every id is linked.");
  process.exit(0);
}

const json = async (url) => (await fetch(url)).json();
const [{ products }, guideBody] = await Promise.all([json(PRODUCTS), json(GUIDE)]);
const guide = new Map((guideBody.priceGuides ?? guideBody).map((r) => [r.idProduct, r]));
const byId = new Map(products.map((p) => [p.idProduct, p]));

// Which Cardmarket expansion a TCGdex set is: the one most of its linked cards sit in.
const setOf = (id) => id.slice(0, id.lastIndexOf("-"));
const expansionOf = new Map();
for (const [id, product] of Object.entries(ids)) {
  const p = product && byId.get(product);
  if (!p) continue;
  const votes = expansionOf.get(setOf(id)) ?? new Map();
  votes.set(p.idExpansion, (votes.get(p.idExpansion) ?? 0) + 1);
  expansionOf.set(setOf(id), votes);
}
const expansion = (set) => {
  const votes = expansionOf.get(set);
  if (!votes) return null;
  return [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

// A card's name as TCGdex says it, for the compare: Cardmarket writes "Yveltal EX [Evil Ball]".
const norm = (s) =>
  s
    .toLowerCase()
    .replace(/\[.*?\]|\(.*?\)/g, "")
    .replace(/[’'.\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The digital game's sets, which have no product to find. */
const isPocket = (set) => /^(A\d|B\d|P-A)/.test(set);

// Every missing card's name first, so a set with no linked card can be recognised from all
// of its names at once. Eight at a time; TCGdex tolerates that. An audit asks for none of
// them: it reads the links that are there, and a linked card's name is in the catalogue
// already downloaded.
const names = new Map();
{
  const asked = audit ? [] : missing.filter((id) => !isPocket(setOf(id)));
  let next = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let i = next++; i < asked.length; i = next++) {
        const id = asked[i];
        const card = await json(`https://api.tcgdex.net/v2/en/cards/${id}`).catch(() => null);
        if (card?.name)
          names.set(id, {
            name: card.name,
            attacks: (card.attacks ?? []).map((a) => norm(a.name ?? "")).filter(Boolean),
          });
      }
    }),
  );
}

/** Expansion → the set of product names in it, normalised, once. */
const namesByExpansion = new Map();
for (const p of products) {
  const bag = namesByExpansion.get(p.idExpansion) ?? new Set();
  bag.add(norm(p.name));
  namesByExpansion.set(p.idExpansion, bag);
}

/**
 * The expansion a set with no linked card must be: the one carrying most of its names.
 * Returns the id, or a line saying why none could be picked.
 */
const recognise = (set) => {
  const wanted = new Set();
  for (const [id, c] of names) if (setOf(id) === set) wanted.add(norm(c.name));
  if (!wanted.size) return { why: "no card of it has a name" };
  const scored = [...namesByExpansion.entries()]
    .map(([exp, bag]) => {
      let hits = 0;
      for (const n of wanted) if (bag.has(n)) hits++;
      return { exp, share: hits / wanted.size, size: bag.size };
    })
    .filter((s) => s.share > 0)
    .sort(
      (a, b) =>
        b.share - a.share || Math.abs(a.size - wanted.size) - Math.abs(b.size - wanted.size),
    );
  const [best, second] = scored;
  if (!best || best.share < 0.5)
    return { why: `no expansion carries half of its ${wanted.size} names` };
  // Nine in ten names is the set whatever else carries them: a promo set's cards reappear
  // in a later collection, and that collection carries them too, less completely.
  if (second && best.share < 0.9 && second.share > best.share - 0.2)
    return {
      why: `two expansions carry its names: ${best.exp} (${Math.round(best.share * 100)}%, ${best.size} products) and ${second.exp} (${Math.round(second.share * 100)}%, ${second.size} products)`,
    };
  return { exp: best.exp, share: best.share };
};
const recognised = new Map();

/**
 * The links that are there, checked against the expansion their set sits in.
 *
 * A set's expansion is the one most of its linked cards are in, so a set needs enough cards
 * linked for that vote to mean anything, and the winner has to be a winner: under five cards,
 * or a majority thinner than three in five, and the set is not judged at all rather than
 * judged on a guess. That leaves the answer to the sets where it is worth something, which is
 * every set anyone holds more than a handful of cards from.
 */
function auditExpansions() {
  const VOTES_NEEDED = 5;
  const MAJORITY = 0.6;
  const wrong = [];
  let judged = 0;
  let unjudged = 0;
  for (const [set, votes] of expansionOf) {
    const total = [...votes.values()].reduce((a, b) => a + b, 0);
    const [home, count] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    if (total < VOTES_NEEDED || count / total < MAJORITY) {
      unjudged += total;
      continue;
    }
    judged += total;
    for (const [id, product] of Object.entries(ids)) {
      if (setOf(id) !== set) continue;
      const p = product && byId.get(product);
      if (!p || p.idExpansion === home) continue;
      const g = guide.get(p.idProduct);
      wrong.push(
        `${id} -> ${p.idProduct} "${p.name}" in expansion ${p.idExpansion}, ` +
          `not ${home} where ${count} of ${total} cards of ${set} sit (trend ${g?.trend ?? "-"})`,
      );
    }
  }
  console.log(
    `Audited ${judged} links across judged sets; ${unjudged} left alone in sets too small or too split to judge.`,
  );
  if (!wrong.length) {
    console.log("Every judged link sits in its set's own expansion.");
    return 0;
  }
  console.log(`\nOut of their expansion (${wrong.length}):\n${wrong.join("\n")}`);
  console.log(
    "\nA product in another expansion is another card: the same name in another language, " +
      "another set, or a sealed box. Pick the right one by hand and commit it, as #341 did.",
  );
  return 1;
}

if (audit) process.exit(auditExpansions());

let set = 0;
let pocket = 0;
const undecided = [];
for (const id of missing) {
  if (isPocket(setOf(id))) {
    pocket += 1;
    continue;
  }
  const card = names.get(id);
  if (!card) {
    undecided.push(`${id}: TCGdex does not know it`);
    continue;
  }
  let exp = expansion(setOf(id));
  if (exp === null) {
    if (!recognised.has(setOf(id))) {
      const found = recognise(setOf(id));
      recognised.set(setOf(id), found);
      if (found.exp)
        console.log(
          `set ${setOf(id)} recognised as expansion ${found.exp} (${Math.round(found.share * 100)}% of its names)`,
        );
    }
    const found = recognised.get(setOf(id));
    if (!found.exp) {
      undecided.push(`${id} (${card.name}): no linked card in its set, and ${found.why}`);
      continue;
    }
    exp = found.exp;
  }
  const wanted = norm(card.name);
  let candidates = products.filter((p) => p.idExpansion === exp && norm(p.name) === wanted);
  if (candidates.length > 1) {
    // Several products by one name are the card's printings, told apart in Cardmarket's
    // brackets by their attacks: "Pikachu [Growl | Thundershock]". TCGdex knows the attacks,
    // so the products naming every one of the card's attacks are the card. Where that still
    // leaves several, they are one printing listed more than once (a reprint, a staff stamp),
    // and the lowest product id is the plain, first one.
    const bracket = (p) => norm(p.name.match(/\[(.*?)\]/)?.[1] ?? "");
    if (card.attacks.length) {
      const byAttack = candidates.filter((p) => card.attacks.every((a) => bracket(p).includes(a)));
      if (byAttack.length) candidates = byAttack;
    }
    const first = [...candidates].sort((a, b) => a.idProduct - b.idProduct)[0];
    if (candidates.every((p) => bracket(p) === bracket(first))) candidates = [first];
  }
  if (candidates.length === 1) {
    ids[id] = candidates[0].idProduct;
    set += 1;
    console.log(`${id} (${card.name}) -> ${candidates[0].idProduct} ${candidates[0].name}`);
  } else if (candidates.length === 0) {
    undecided.push(`${id} (${card.name}): nothing by that name in expansion ${exp}`);
  } else {
    const lines = candidates.map((p, i) => {
      const g = guide.get(p.idProduct);
      return `    V${i + 1} ${p.idProduct} ${p.name} trend ${g?.trend ?? "-"} low ${g?.low ?? "-"}`;
    });
    undecided.push(
      `${id} (${card.name}): ${candidates.length} products in expansion ${exp}, pick by hand:\n${lines.join("\n")}`,
    );
  }
}

if (pocket) console.log(`\n${pocket} Pocket cards skipped: no physical card, no product.`);
if (undecided.length) console.log(`\nUndecided (${undecided.length}):\n${undecided.join("\n")}`);
if (write && set) {
  writeFileSync(
    IDS,
    JSON.stringify(Object.fromEntries(Object.entries(ids).sort()), null, 2) + "\n",
  );
  console.log(`\nWrote ${set} id${set === 1 ? "" : "s"}.`);
} else if (set) {
  console.log(`\n${set} would be set; run with --write.`);
}
