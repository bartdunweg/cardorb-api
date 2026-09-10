import { describe, expect, it } from "vitest";
import { forGrid, forPublic } from "./cards";
import type { CardSet, OwnedCard, Price, Variant } from "./cards";

/**
 * What a stranger is allowed to see, asserted field by field.
 *
 * This exists because the old version of forPublic() was called stripPrices(),
 * did exactly that, and left `variants` untouched — so /user/<name> and
 * /api/v1/public/:username/collection published what the owner paid for every
 * card, its condition, its grade, their private notes and how many they hold.
 * The name described a third of the job and nothing checked the other two.
 *
 * The allow-list below is deliberately the assertion rather than a deny-list of
 * the fields that leaked: a new column on `cards` becomes a new field on
 * Variant, and a deny-list would let it through by default. This fails instead.
 *
 * ── Two holes in that, both in the fixture rather than in the assertion ────
 *
 * The whole-allow-list check below filtered the carried keys *by value* —
 * anything not `null` and not `false` — over a fixture that gave two fields a
 * null of their own. So `language: null` and `collectionId: null` in the
 * fixture meant forPublic() could carry either of them straight through and
 * this file would still say only rarity and owned came out. Language is a fact
 * about somebody's copy and the folder id is the name they filed it under;
 * neither is a stranger's business, and neither was actually guarded.
 *
 * Every field below now carries a value, so "was it stripped" is a question the
 * fixture can answer, and the key list is asserted whole beside it: a
 * sixteenth field on Variant has to be spelled here before it can leave.
 */

const PRICE: Price = { low: 1, market: 90, avg30: 95, nm: { low: 95, mid: 100, high: 110 } };

const variant = (over: Partial<Variant> = {}): Variant => ({
  id: "row-1",
  rarity: "Illustration Rare",
  owned: true,
  finish: "reverse-holo",
  foilPattern: "cosmos",
  quantity: 3,
  condition: "Near Mint",
  grade: "PSA 10",
  language: "ja",
  purchasePrice: 42.5,
  purchaseDate: "2026-01-01",
  notes: "bought at the shop on the corner",
  isFavorite: true,
  acquiredAt: "2026-01-01",
  excluded: true,
  collectionId: "88888888-8888-4888-8888-888888888888",
  ...over,
});

/**
 * Exactly what a public variant is made of: the two carried fields and the
 * thirteen written as null or false. Spelled out rather than derived from
 * Variant, because deriving it from the type would make the type the assertion
 * — and the type is the thing that grows.
 */
const PUBLIC_VARIANT_KEYS = [
  "acquiredAt",
  "collectionId",
  "condition",
  "excluded",
  "finish",
  "foilPattern",
  "grade",
  "id",
  "isFavorite",
  "language",
  "notes",
  "owned",
  "purchaseDate",
  "purchasePrice",
  "quantity",
  "rarity",
];

const card = (over: Partial<OwnedCard> = {}): OwnedCard => ({
  key: "sv03-125",
  name: "Charizard",
  number: "125",
  type: "Fire",
  gen: "Scarlet & Violet",
  image: "https://assets.tcgdex.net/x/low.webp",
  imageHigh: "https://assets.tcgdex.net/x/high.webp",
  imageSize: null,
  speciesId: 6,
  variants: [variant()],
  owned: true,
  price: PRICE,
  priceHolo: PRICE,
  tcgId: "sv03-125",
  ...over,
});

const set = (cards: OwnedCard[]): CardSet => ({
  language: null,
  name: "Obsidian Flames",
  title: "Obsidian Flames",
  abbreviation: null,
  logo: null,
  logoSize: null,
  releaseDate: "2023-08-11",
  total: 197,
  cards,
});

const only = (sets: CardSet[]) => sets[0]!.cards[0]!;

describe("forPublic", () => {
  it("takes the price off the card", () => {
    expect(only(forPublic([set([card()])])).price).toBeNull();
  });

  it("carries exactly the two variant fields the public page reads", () => {
    // rarity draws the tags under a scan and feeds the rarity filter; owned is
    // what makes a wishlist tag an outline instead of a fill. Nothing else on
    // the public path touches a variant.
    const [v] = only(forPublic([set([card()])])).variants;
    expect(v).toMatchObject({ rarity: "Illustration Rare", owned: true });
  });

  it("does not publish what the owner paid, or in what state, or how many", () => {
    const [v] = only(forPublic([set([card()])])).variants;
    expect(v).toMatchObject({
      purchasePrice: null,
      purchaseDate: null,
      condition: null,
      grade: null,
      // Both of these were null in the fixture too, so neither was guarded by
      // anything: forPublic() could have spread them through untouched.
      language: null,
      collectionId: null,
      finish: null,
      foilPattern: null,
      notes: null,
      quantity: null,
      acquiredAt: null,
      isFavorite: false,
      excluded: false,
    });
  });

  it("does not hand out the row id a write route acts on", () => {
    // The policies would refuse a stranger anyway. There is still no reason to
    // publish the list of identifiers to try.
    expect(only(forPublic([set([card()])])).variants[0]!.id).toBeNull();
  });

  it("carries the two allowed fields and nulls every other one", () => {
    // The allow-list, asserted as a whole rather than one key at a time, and in
    // two halves because one of them alone was not enough.
    //
    // The keys, first: a sixteenth field on Variant has to be written into
    // forPublic() or the object stops type-checking, and it has to be written
    // here before this passes. That is the moment somebody decides whether a
    // stranger may see it, which is the decision this file exists to force.
    //
    // Then the values — over a fixture where every private field carries one,
    // so "carried through" and "nulled" are different answers. Filtering by
    // value alone was the whole check, and it let `language` and `collectionId`
    // through because the fixture nulled them itself.
    //
    // `null`, not absent — see the note in forPublic about why the keys are
    // still written. When that changes, the first assertion becomes exactly
    // ["owned", "rarity"] and the second falls away.
    const variant = only(forPublic([set([card()])])).variants[0]!;
    expect(Object.keys(variant).sort()).toEqual(PUBLIC_VARIANT_KEYS);
    const carried = Object.entries(variant).filter(([, v]) => v !== null && v !== false);
    expect(carried.map(([k]) => k).sort()).toEqual(["owned", "rarity"]);
  });

  it("leaves nothing private anywhere in the serialised payload", () => {
    // The belt to the braces above: whatever shape a future Variant takes, none
    // of these strings may appear in what crosses the wire.
    const json = JSON.stringify(forGrid(forPublic([set([card()])])));
    for (const secret of ["42.5", "PSA 10", "Near Mint", "corner", "row-1", "90", "88888888"]) {
      expect(json).not.toContain(secret);
    }
  });

  it("keeps the card itself intact", () => {
    // This is still a collection somebody chose to show. Stripping it to
    // nothing would be a different bug.
    expect(only(forPublic([set([card()])]))).toMatchObject({
      name: "Charizard",
      number: "125",
      tcgId: "sv03-125",
      owned: true,
    });
    expect(forPublic([set([card()])])[0]).toMatchObject({ title: "Obsidian Flames", total: 197 });
  });

  it("does not mutate the collection it was handed", () => {
    // It runs on the output of getCards(), which is cached and shared across
    // requests. Mutating in place would strip the owner's own collection.
    const sets = [set([card()])];
    forPublic(sets);
    expect(sets[0]!.cards[0]!.price).toEqual(PRICE);
    expect(sets[0]!.cards[0]!.variants[0]!.purchasePrice).toBe(42.5);
  });
});
