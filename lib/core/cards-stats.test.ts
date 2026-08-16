import { describe, expect, it } from "vitest";
import { copiesHeld, getCardsStats } from "./cards-stats";
import type { CardSet, OwnedCard, Variant } from "./cards";

const variant = (over: Partial<Variant> = {}): Variant => ({
  id: "row-1",
  rarity: null,
  owned: true,
  quantity: 1,
  condition: null,
  grade: null,
  purchasePrice: null,
  purchaseDate: null,
  notes: null,
  isFavorite: false,
  acquiredAt: null,
  excluded: false,
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
  tcgId: null,
  ...over,
});

const set = (name: string, cards: OwnedCard[], total: number | null = null): CardSet => ({
  name,
  title: name,
  logo: null,
  logoSize: null,
  releaseDate: null,
  total,
  cards,
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

describe("getCardsStats", () => {
  it("counts the wishlist apart from the binder", () => {
    const s = getCardsStats([
      set("A", [card({ key: "1" }), card({ key: "2", owned: false })]),
      set("B", [card({ key: "3" })]),
    ]);
    expect(s.cards).toBe(3);
    expect(s.owned).toBe(2);
    expect(s.wishlist).toBe(1);
    expect(s.sets).toBe(2);
  });

  it("adds up only held cards that have a price", () => {
    const s = getCardsStats([
      set("A", [
        card({ key: "1", price: { low: 10, market: 10, avg30: 12, nm: null } }),
        // Wanted, not held: counting it would price a binder that does not
        // contain it.
        card({ key: "2", owned: false, price: { low: 1000, market: 1000, avg30: 1000, nm: null } }),
        // Held but unpriced: unknown, not free.
        card({ key: "3", price: null }),
      ]),
    ]);
    expect(s.value).toBe(10);
    expect(s.priced).toBe(1);
  });

  it("values every copy held, not one per card", () => {
    const s = getCardsStats([
      set("A", [
        card({
          key: "1",
          price: { low: 10, market: 10, avg30: 12, nm: null },
          variants: [variant({ id: "a", quantity: 2 }), variant({ id: "b", quantity: 1 })],
        }),
      ]),
    ]);
    expect(s.value).toBe(30);
    // Coverage, not holdings: one card had a price, however many of it there is.
    expect(s.priced).toBe(1);
  });

  it("ranks the priciest cards per copy, so a stack of commons cannot outrank a chase", () => {
    const s = getCardsStats([
      set("A", [
        card({
          key: "bulk",
          name: "Bulk",
          price: { low: 1, market: 1, avg30: 1, nm: null },
          variants: [variant({ quantity: 500 })],
        }),
        card({ key: "chase", name: "Chase", price: { low: 90, market: 90, avg30: 90, nm: null } }),
      ]),
    ]);
    expect(s.top.map((t) => t.card.name)).toEqual(["Chase", "Bulk"]);
    // The value tile still knows about the stack, though.
    expect(s.value).toBe(590);
  });

  it("ranks the priciest held cards and leaves the wishlist out", () => {
    const s = getCardsStats([
      set("A", [
        card({ key: "cheap", name: "Cheap", price: { low: 2, market: 2, avg30: 2, nm: null } }),
        card({ key: "dear", name: "Dear", price: { low: 90, market: 90, avg30: 95, nm: null } }),
        card({
          key: "want",
          name: "Want",
          owned: false,
          price: { low: 5000, market: 5000, avg30: 5000, nm: null },
        }),
      ]),
    ]);
    expect(s.top.map((t) => t.card.name)).toEqual(["Dear", "Cheap"]);
    // The set rides along, because "Charizard, €300" without it is half an answer.
    expect(s.top[0]?.set).toBe("A");
  });

  it("honours the top count", () => {
    const cards = Array.from({ length: 20 }, (_, i) =>
      card({ key: String(i), price: { low: i, market: i, avg30: i, nm: null } }),
    );
    expect(getCardsStats([set("A", cards)], 3).top).toHaveLength(3);
    expect(getCardsStats([set("A", cards)]).top).toHaveLength(10);
  });

  it("tallies eras and types commonest first, ignoring blanks", () => {
    const s = getCardsStats([
      set("A", [
        card({ key: "1", gen: "Base", type: "Fire" }),
        card({ key: "2", gen: "Base", type: null }),
        card({ key: "3", gen: "Sword & Shield", type: "Fire" }),
        card({ key: "4", gen: null, type: "Water" }),
      ]),
    ]);
    expect(s.byEra).toEqual([
      { value: "Base", count: 2 },
      { value: "Sword & Shield", count: 1 },
    ]);
    expect(s.byType).toEqual([
      { value: "Fire", count: 2 },
      { value: "Water", count: 1 },
    ]);
  });

  it("prices the wishlist per card, not per copy, and leaves the binder out", () => {
    const s = getCardsStats([
      set("A", [
        card({ key: "held", price: { low: 5, market: 5, avg30: 5, nm: null } }),
        card({
          key: "want",
          owned: false,
          price: { low: 30, market: 30, avg30: 30, nm: null },
          // Two wanted printings of one card is still one card to buy.
          variants: [variant({ id: "a", owned: false }), variant({ id: "b", owned: false })],
        }),
      ]),
    ]);
    expect(s.wishlistValue).toBe(30);
    expect(s.wishlistPriced).toBe(1);
    // And the held card is not in it.
    expect(s.value).toBe(5);
  });

  describe("movement", () => {
    const at = (market: number, avg30: number | null) => ({ low: 1, market, avg30, nm: null });

    it("compares market against the 30-day average, over copies held", () => {
      const s = getCardsStats([
        set("A", [
          card({ key: "1", price: at(110, 100), variants: [variant({ quantity: 2 })] }),
          card({ key: "2", price: at(90, 100) }),
        ]),
      ]);
      // 220 now against 200 then, plus 90 against 100: 310 / 300.
      expect(s.movement).toMatchObject({ now: 310, avg30: 300, cards: 2 });
      expect(s.movement!.pct).toBeCloseTo(310 / 300 - 1);
    });

    it("never compares the Near Mint estimate against a raw average", () => {
      // shownPrice() answers with nm.mid, which is market times a band. If that
      // fed the comparison, a market sitting exactly on its average would
      // report a permanent premium that never moves. Same number both sides:
      // the honest answer is zero.
      const s = getCardsStats([set("A", [card({ price: { low: 1, market: 100, avg30: 100, nm: { low: 105, mid: 115, high: 125 } } })])]);
      expect(s.movement!.pct).toBe(0);
      // The value tile still uses the Near Mint estimate — that part is right.
      expect(s.value).toBe(115);
    });

    it("counts only cards that carry both figures", () => {
      const s = getCardsStats([
        set("A", [card({ key: "1", price: at(110, 100) }), card({ key: "2", price: at(50, null) })]),
      ]);
      expect(s.movement).toMatchObject({ now: 110, avg30: 100, cards: 1 });
    });

    it("is absent rather than zero when nothing can be compared", () => {
      // A binder nobody could price has not held steady — it is unknown, and
      // the two read the same on a page unless one of them is missing.
      expect(getCardsStats([set("A", [card({ price: null })])]).movement).toBeNull();
      expect(getCardsStats([set("A", [card({ owned: false, price: at(9, 9) })])]).movement).toBeNull();
    });
  });

  it("survives an empty collection", () => {
    const s = getCardsStats([]);
    expect(s).toMatchObject({ cards: 0, owned: 0, wishlist: 0, sets: 0, value: 0, priced: 0 });
    expect(s.top).toEqual([]);
  });
});
