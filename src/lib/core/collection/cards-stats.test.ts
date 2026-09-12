import { describe, expect, it } from "vitest";
import { copiesHeld, heldValue } from "./cards-stats";
import type { OwnedCard, Variant } from "./cards";

const variant = (over: Partial<Variant> = {}): Variant => ({
  id: "row-1",
  rarity: null,
  owned: true,
  finish: null,
  foilPattern: null,
  edition: null,
  quantity: 1,
  condition: null,
  grade: null,
  language: null,
  purchasePrice: null,
  purchaseDate: null,
  notes: null,
  isFavorite: false,
  dexFace: false,
  acquiredAt: null,
  excluded: false,
  collectionId: null,
  ...over,
});

/**
 * One printing, held once, unless a test says otherwise.
 *
 * The default used to be `variants: []`, which was harmless while the value was
 * counted per card and became a lie the moment it was counted per copy: a card
 * with no printings is held zero times, so every fixture here was worth nothing.
 * The default matching `owned: true` is what keeps the two fields honest.
 */
const card = (over: Partial<OwnedCard> = {}): OwnedCard => ({
  key: over.name ?? "c",
  name: "Pikachu",
  number: "001",
  type: "Electric",
  gen: "Base",
  image: null,
  imageHigh: null,
  imageSize: null,
  speciesId: null,
  variants: [variant({ owned: over.owned ?? true })],
  owned: true,
  price: null,
  priceHolo: null,
  tcgId: null,
  ...over,
});

describe("copiesHeld", () => {
  it("sums the owned printings and ignores the wanted ones", () => {
    const c = card({
      variants: [
        variant({ id: "a", quantity: 2 }),
        variant({ id: "b", quantity: 3 }),
        // Wanted three times over is still nothing in the binder.
        variant({ id: "c", owned: false, quantity: 3 }),
      ],
    });
    expect(copiesHeld(c)).toBe(5);
  });

  it("still counts a printing kept out of the latest pull", () => {
    // `excluded` is about the portfolio site's feed, not about ownership. A
    // valuation that dropped these would be quietly low.
    expect(copiesHeld(card({ variants: [variant({ excluded: true, quantity: 4 })] }))).toBe(4);
  });

  it("refuses to let a negative quantity subtract from the total", () => {
    const c = card({
      variants: [variant({ id: "a", quantity: 2 }), variant({ id: "b", quantity: -5 })],
    });
    expect(copiesHeld(c)).toBe(2);
  });
});

/**
 * The foil rules, on heldValue() itself.
 *
 * These used to run through getCardsStats().value — a whole-collection tally
 * that no route ever called — so five assertions about one card's arithmetic
 * were paying for a set fixture and a dashboard's worth of flattening. The
 * tally is gone; the rules are the same, and they are what countStats(),
 * movers.ts and the nightly snapshot all add up.
 */
describe("heldValue with a foil printing", () => {
  const NORMAL = { low: 1, market: 10, avg30: 10, nm: null };
  const FOIL = { low: 2, market: 20, avg30: 20, nm: null };

  it("prices a reverse holo as a reverse holo, and its normal twin as normal", () => {
    // The whole reason the finish column exists: one card, two copies, two
    // prices. This used to come to 20 — the normal price, twice.
    expect(
      heldValue(
        card({
          price: NORMAL,
          priceHolo: FOIL,
          variants: [
            variant({ id: "a", finish: "normal" }),
            variant({ id: "b", finish: "reverse-holo" }),
          ],
        }),
      ),
    ).toBe(30);
  });

  it("prices a plain holo from the plain fields, not the foil ones", () => {
    // Measured, not assumed. On a card that exists only as a holo, Cardmarket's
    // plain fields already describe the holo — there is no other printing — and
    // its -holo fields are a thinner market at 0.47x. Treating a holo like a
    // reverse holo dropped this collection by €2,488.
    expect(
      heldValue(card({ price: NORMAL, priceHolo: FOIL, variants: [variant({ finish: "holo" })] })),
    ).toBe(10);
  });

  it("falls back to the normal price where Cardmarket has no foil listing", () => {
    // 865 of this collection's 1,526 products are in exactly this position.
    // The copy really is a reverse holo; there is simply no separate price.
    expect(
      heldValue(
        card({ price: NORMAL, priceHolo: null, variants: [variant({ finish: "reverse-holo" })] }),
      ),
    ).toBe(10);
  });

  it("prices an unclassified copy as normal", () => {
    // null is "nobody has said", which is every row in this collection until
    // somebody fills it in. It must not be worth nothing, and it must not
    // silently claim the foil price either.
    expect(
      heldValue(card({ price: NORMAL, priceHolo: FOIL, variants: [variant({ finish: null })] })),
    ).toBe(10);
  });

  it("multiplies the foil price by that printing's own quantity", () => {
    expect(
      heldValue(
        card({
          price: NORMAL,
          priceHolo: FOIL,
          variants: [variant({ id: "a", finish: "reverse-holo", quantity: 3 })],
        }),
      ),
    ).toBe(60);
  });

  it("counts a wished printing as nothing, however it is priced", () => {
    // `owned` gates the sum rather than filtering after it: a card on the
    // wishlist is not worth anything to a binder that does not hold it.
    expect(
      heldValue(card({ price: NORMAL, variants: [variant({ owned: false, quantity: 4 })] })),
    ).toBe(0);
  });
});
