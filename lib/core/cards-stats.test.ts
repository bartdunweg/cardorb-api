import { describe, expect, it } from "vitest";
import { getCardsStats } from "./cards-stats";
import type { CardSet, OwnedCard } from "./cards";

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
  variants: [],
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

  it("survives an empty collection", () => {
    const s = getCardsStats([]);
    expect(s).toMatchObject({ cards: 0, owned: 0, wishlist: 0, sets: 0, value: 0, priced: 0 });
    expect(s.top).toEqual([]);
  });
});
