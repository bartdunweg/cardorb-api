import { describe, expect, it } from "vitest";
import { folderSeries } from "./folder-history";
import type { CardItem } from "./items";

const copy = (over: Partial<CardItem>): CardItem =>
  ({
    id: "row",
    name: "Pikachu",
    number: "25",
    set: "base1",
    setTitle: "Base Set",
    rarity: null,
    gen: null,
    type: null,
    image: null,
    imageHigh: null,
    speciesId: 25,
    tcgId: "base1-25",
    owned: true,
    finish: null,
    quantity: 1,
    condition: null,
    grade: null,
    language: null,
    purchasePrice: null,
    purchaseDate: null,
    notes: null,
    isFavorite: false,
    acquiredAt: null,
    collectionId: null,
    price: null,
    priceHolo: null,
    ...over,
  }) as CardItem;

describe("folderSeries", () => {
  it("sums each day's readings over the copies, quantity times, in whole euros", () => {
    const items = [copy({ quantity: 2 }), copy({ tcgId: "base1-4" })];
    const prices = [
      { tcgId: "base1-25", date: "2026-09-02", market: 10.4, holo: null },
      { tcgId: "base1-4", date: "2026-09-02", market: 100, holo: null },
      { tcgId: "base1-25", date: "2026-09-01", market: 10, holo: null },
      { tcgId: "base1-4", date: "2026-09-01", market: 90, holo: null },
    ];
    expect(folderSeries(items, prices)).toEqual([
      { date: "2026-09-01", value: 110, cards: 3, priced: 3, unpriced: 0 },
      { date: "2026-09-02", value: 121, cards: 3, priced: 3, unpriced: 0 },
    ]);
  });

  it("prices a reverse holo at the foil, falls back to the plain price, and counts a missing reading as unpriced", () => {
    const items = [
      copy({ finish: "reverse-holo" }),
      copy({ tcgId: "base1-4", finish: "reverse-holo" }),
      copy({ tcgId: "base1-7" }),
      copy({ tcgId: "wish", owned: false }),
    ];
    const prices = [
      { tcgId: "base1-25", date: "2026-09-01", market: 10, holo: 30 },
      { tcgId: "base1-4", date: "2026-09-01", market: 5, holo: null },
    ];
    expect(folderSeries(items, prices)).toEqual([
      { date: "2026-09-01", value: 35, cards: 3, priced: 2, unpriced: 1 },
    ]);
  });

  it("values the wishlist: every wish once, owned copies left out", () => {
    const items = [copy({ owned: false, quantity: 3 }), copy({ tcgId: "base1-4" })];
    const prices = [
      { tcgId: "base1-25", date: "2026-09-01", market: 10, holo: null },
      { tcgId: "base1-4", date: "2026-09-01", market: 100, holo: null },
    ];
    expect(folderSeries(items, prices, "wishlist")).toEqual([
      { date: "2026-09-01", value: 10, cards: 1, priced: 1, unpriced: 0 },
    ]);
  });

  it("is empty without readings", () => {
    expect(folderSeries([copy({})], [])).toEqual([]);
  });
});
