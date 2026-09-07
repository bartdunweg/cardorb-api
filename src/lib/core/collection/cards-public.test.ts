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
  language: null,
  purchasePrice: 42.5,
  purchaseDate: "2026-01-01",
  notes: "bought at the shop on the corner",
  isFavorite: true,
  acquiredAt: "2026-01-01",
  excluded: true,
  collectionId: null,
  ...over,
});

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
  name: "Obsidian Flames",
  title: "Obsidian Flames",
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
      language: null,
      notes: null,
      quantity: null,
      acquiredAt: null,
      isFavorite: false,
    });
  });

  it("does not hand out the row id a write route acts on", () => {
    // The policies would refuse a stranger anyway. There is still no reason to
    // publish the list of identifiers to try.
    expect(only(forPublic([set([card()])])).variants[0]!.id).toBeNull();
  });

  it("carries the two allowed fields and nulls every other one", () => {
    // The allow-list, asserted as a whole rather than one key at a time. This
    // is the test that fails when a thirteenth field is added to Variant and
    // somebody spreads it in here by habit.
    //
    // `null`, not absent — see the note in forPublic about why the keys are
    // still written. When that changes, this assertion becomes
    // `Object.keys(variant)` equalling exactly ["owned", "rarity"].
    const variant = only(forPublic([set([card()])])).variants[0]!;
    const carried = Object.entries(variant).filter(([, v]) => v !== null && v !== false);
    expect(carried.map(([k]) => k).sort()).toEqual(["owned", "rarity"]);
  });

  it("leaves nothing private anywhere in the serialised payload", () => {
    // The belt to the braces above: whatever shape a future Variant takes, none
    // of these strings may appear in what crosses the wire.
    const json = JSON.stringify(forGrid(forPublic([set([card()])])));
    for (const secret of ["42.5", "PSA 10", "Near Mint", "corner", "row-1", "90"]) {
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
