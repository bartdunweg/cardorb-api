import { describe, expect, it } from "vitest";
import { folderSeries, holdingsSeries } from "./folder-history";
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

describe("folderSeries, per printing", () => {
  // Bart, 2026-09-13: "ik wil liefst prijs per editie". A reading stored per printing values each
  // copy at its own run, as today's price does.
  it("values a 1st Edition copy at the stamped run's figure and an unlimited one at its own", () => {
    const items = [
      copy({ tcgId: "base2-10", finish: "holo", edition: "1st-edition" }),
      copy({ tcgId: "base2-10", finish: "holo", edition: "unlimited", id: "row-2" }),
    ];
    const prices = [
      {
        tcgId: "base2-10",
        date: "2026-09-12",
        market: 15.19,
        holo: 53.23,
        printings: {
          "1st-edition-holofoil": 145.91,
          "unlimited-holofoil": 53.23,
          unlimited: 15.19,
        },
      },
    ];
    expect(folderSeries(items, prices)[0]?.value).toBe(Math.round(145.91 + 53.23));
  });
});

describe("holdingsSeries", () => {
  // The Home line (Bart, 2026-09-12): what the collection held on the day, at that day's price. A
  // copy counts from the day it was added, so adding cards steps the line up, as holding more does.
  it("counts a copy only from the day it was added", () => {
    const items = [
      copy({ tcgId: "base1-4", acquiredAt: "2024-02-12T10:00:00Z" }),
      copy({ tcgId: "base1-25", acquiredAt: "2024-02-20T09:00:00Z", quantity: 2 }),
    ];
    const prices = [
      { tcgId: "base1-4", date: "2024-02-17", market: 100, holo: null },
      { tcgId: "base1-25", date: "2024-02-17", market: 5, holo: null },
      { tcgId: "base1-4", date: "2024-02-24", market: 110, holo: null },
      { tcgId: "base1-25", date: "2024-02-24", market: 6, holo: null },
    ];
    expect(holdingsSeries(items, prices)).toEqual([
      { date: "2024-02-17", value: 100, cards: 1, priced: 1, unpriced: 0, added: 0, addedValue: 0 },
      // The two copies of base1-25 came in between the points, at 6 each that day.
      {
        date: "2024-02-24",
        value: 122,
        cards: 3,
        priced: 3,
        unpriced: 0,
        added: 2,
        addedValue: 12,
      },
    ]);
  });

  it("counts a copy with no date as held from its card's first price", () => {
    const items = [
      copy({ tcgId: "base1-4", acquiredAt: null }),
      copy({ tcgId: "base1-25", acquiredAt: "2024-03-01T00:00:00Z" }),
    ];
    const prices = [
      { tcgId: "base1-25", date: "2024-02-17", market: 5, holo: null },
      { tcgId: "base1-4", date: "2024-02-24", market: 100, holo: null },
    ];
    // 2024-02-17: base1-25 was not held yet and base1-4 had no price yet, so there is no point.
    // Until 2026-09-13 base1-4 counted from the start, unpriced; now from its first price.
    expect(holdingsSeries(items, prices)).toEqual([
      { date: "2024-02-24", value: 100, cards: 1, priced: 1, unpriced: 0, added: 0, addedValue: 0 },
    ]);
  });

  it("reads the foil series for a reverse copy, as a folder's line does", () => {
    const items = [
      copy({ tcgId: "sv01-1", finish: "reverse-holo", acquiredAt: "2024-01-01T00:00:00Z" }),
    ];
    const prices = [{ tcgId: "sv01-1", date: "2024-02-17", market: 1, holo: 4 }];
    expect(holdingsSeries(items, prices)[0]?.value).toBe(4);
  });

  // 2026-09-13: weekdays had readings for only the cards held when the nightly series began, and
  // 08-16's were all empty, so the line fell from EUR 40,000 to 28,000 and to zero between Saturdays.
  it("values a card at its last reading on a day without one, and not past two weeks", () => {
    const items = [copy({ tcgId: "base1-4" }), copy({ tcgId: "svp-1" })];
    const prices = [
      { tcgId: "base1-4", date: "2026-08-15", market: 100, holo: null },
      { tcgId: "svp-1", date: "2026-08-15", market: 10, holo: null },
      { tcgId: "base1-4", date: "2026-08-16", market: null, holo: null },
      { tcgId: "base1-4", date: "2026-08-17", market: 102, holo: null },
      { tcgId: "base1-4", date: "2026-08-30", market: 104, holo: null },
    ];
    expect(holdingsSeries(items, prices)).toEqual([
      { date: "2026-08-15", value: 110, cards: 2, priced: 2, unpriced: 0, added: 0, addedValue: 0 },
      { date: "2026-08-16", value: 110, cards: 2, priced: 2, unpriced: 0, added: 0, addedValue: 0 },
      { date: "2026-08-17", value: 112, cards: 2, priced: 2, unpriced: 0, added: 0, addedValue: 0 },
      { date: "2026-08-30", value: 104, cards: 2, priced: 1, unpriced: 1, added: 0, addedValue: 0 },
    ]);
  });

  // Bart, 2026-09-13: a copy added before its card had a price joins the line on its first price.
  it("counts a copy added before its card had a price from the first price, and one never priced from its date", () => {
    const items = [
      copy({ tcgId: "old", acquiredAt: "2025-02-01T00:00:00Z" }),
      copy({ tcgId: "preorder", acquiredAt: "2025-02-06T00:00:00Z", id: "row-2" }),
      copy({ tcgId: "never", acquiredAt: "2025-02-06T00:00:00Z", id: "row-3" }),
    ];
    const prices = [
      { tcgId: "old", date: "2025-02-08", market: 10, holo: null },
      { tcgId: "old", date: "2025-03-28", market: 10, holo: null },
      { tcgId: "preorder", date: "2025-03-28", market: 5, holo: null },
    ];
    expect(holdingsSeries(items, prices)).toEqual([
      { date: "2025-02-08", value: 10, cards: 2, priced: 1, unpriced: 1, added: 0, addedValue: 0 },
      { date: "2025-03-28", value: 15, cards: 3, priced: 2, unpriced: 1, added: 1, addedValue: 5 },
    ]);
  });

  it("draws no point before the first copy was added", () => {
    const items = [copy({ tcgId: "base1-4", acquiredAt: "2025-01-01T00:00:00Z" })];
    const prices = [
      { tcgId: "base1-4", date: "2024-02-17", market: 100, holo: null },
      { tcgId: "base1-4", date: "2025-01-04", market: 120, holo: null },
    ];
    expect(holdingsSeries(items, prices).map((p) => p.date)).toEqual(["2025-01-04"]);
  });
});
