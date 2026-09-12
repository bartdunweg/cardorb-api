import { describe, expect, it } from "vitest";
import { guidePrices } from "./price-guide";

const guide = {
  createdAt: "2026-09-02T04:00:00Z",
  priceGuides: [
    { idProduct: 1, low: 1, trend: 4, avg30: 4.2, "low-holo": 0, "trend-holo": 0, "avg30-holo": 0 },
    {
      idProduct: 2,
      low: 10,
      trend: 30,
      avg30: 12,
      "low-holo": 20,
      "trend-holo": 25,
      "avg30-holo": 24,
    },
    { idProduct: 3 },
    // The Shadowless product of a-1: its own row, its own figures, dearer by multiples.
    { idProduct: 660224, low: 950, trend: 3567, avg30: 2475 },
  ],
};
const products = { "a-1": 1, "b-2": 2, "c-3": 3, "d-unknown": null, "e-missing": 99 };

describe("guidePrices", () => {
  it("prices a card from its guide row, with the foil where the guide has one", () => {
    const prices = guidePrices(["a-1", "b-2"], guide, products);
    expect(prices.get("a-1")).toEqual({
      price: { low: 1, market: 4, avg30: 4.2, nm: null },
      holo: null,
      shadowless: null,
    });
    // A trend far above the thirty-day average is capped to it, as the snapshot does.
    expect(prices.get("b-2")?.price?.market).toBe(12);
    expect(prices.get("b-2")?.holo?.market).toBe(25);
  });

  it("prices the Shadowless run from its own product, where the card has one", () => {
    const runs = { "a-1": { shadowless: 660224 }, "b-2": { shadowless: 404 } };
    const prices = guidePrices(["a-1", "b-2"], guide, products, runs);
    // The run's own figures, not the card's: €3,567 where the ordinary printing is €4.
    expect(prices.get("a-1")?.shadowless?.market).toBe(3567);
    expect(prices.get("a-1")?.price?.market).toBe(4);
    // A run the guide has no row for is null, not the ordinary price under another name:
    // copyPriceOf() falls back to the ordinary price itself, and says so where it does.
    expect(prices.get("b-2")?.shadowless).toBeNull();
  });

  it("leaves out what it cannot price, rather than guessing", () => {
    const prices = guidePrices(["c-3", "d-unknown", "e-missing"], guide, products);
    expect([...prices.keys()]).toEqual([]);
  });
});
