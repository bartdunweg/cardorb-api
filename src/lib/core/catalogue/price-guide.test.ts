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
  ],
};
const products = { "a-1": 1, "b-2": 2, "c-3": 3, "d-unknown": null, "e-missing": 99 };

describe("guidePrices", () => {
  it("prices a card from its guide row, with the foil where the guide has one", () => {
    const prices = guidePrices(["a-1", "b-2"], guide, products);
    expect(prices.get("a-1")).toEqual({
      price: { low: 1, market: 4, avg30: 4.2, nm: null },
      holo: null,
    });
    // A trend far above the thirty-day average is capped to it, as the snapshot does.
    expect(prices.get("b-2")?.price.market).toBe(12);
    expect(prices.get("b-2")?.holo?.market).toBe(25);
  });

  it("leaves out what it cannot price, rather than guessing", () => {
    const prices = guidePrices(["c-3", "d-unknown", "e-missing"], guide, products);
    expect([...prices.keys()]).toEqual([]);
  });
});
