/**
 * The price calibration, against the cards it was calibrated on.
 *
 * Every case below is a real Cardmarket product page read by hand on 5 August
 * 2026 with the language filter on English and the condition filter on Near
 * Mint, so `from` here is the number Cardmarket actually showed. That is the
 * only reason these constants are defensible, and the only thing that would
 * catch someone tightening them on a hunch.
 */

import { describe, expect, it } from "vitest";
import { priceOf, shownPrice } from "./cards";

/** label, Cardmarket's own low/trend/avg30, and the English Near Mint "From" on the page. */
const MEASURED = [
  ["Cynthia's Garchomp ex (DRI 232)", 145.0, 191.47, 233.33, 230.0],
  ["Morpeko ex (PBL 117)", 45.0, 72.65, 66.74, 100.0],
  ["Cinccino ex (CRI 119)", 22.0, 42.59, 46.47, 55.0],
  ["Marnie's Grimmsnarl ex (ASC 287)", 20.0, 39.16, 43.17, 45.95],
  ["Corviknight V (SIT TG18)", 9.0, 12.58, 11.81, 11.49],
  ["Fletchinder (PAL 199)", 9.0, 12.72, 11.28, 11.0],
  ["Miltank (CRZ GG24)", 5.0, 8.64, 8.5, 7.0],
] as const;

describe("priceOf", () => {
  it.each(MEASURED)(
    "brackets the real English Near Mint price of %s",
    (_, low, trend, avg30, from) => {
      const price = priceOf({ low, trend, avg30 });
      expect(price?.nm).not.toBeNull();
      expect(price!.nm!.low).toBeLessThanOrEqual(from);
      expect(price!.nm!.high).toBeGreaterThanOrEqual(from);
    },
  );

  // The grid and the totals show one figure rather than a range, so the middle
  // of it carries the same burden the bounds do. Measured against the same seven
  // pages it lands within 8.7%, so 10% is the line that catches a drift without
  // failing on the spread that was always there.
  it.each(MEASURED)(
    "puts the middle of the range within 10%% for %s",
    (_, low, trend, avg30, from) => {
      const mid = shownPrice(priceOf({ low, trend, avg30 }))!;
      expect(Math.abs(mid / from - 1)).toBeLessThan(0.1);
    },
  );

  it("shows the market price itself where there is no range to take a middle of", () => {
    const price = priceOf({ low: 0.02, trend: 0.45, avg30: 0.41 });
    expect(price?.nm).toBeNull();
    expect(shownPrice(price)).toBe(0.45);
  });

  it("has nothing to show for a card Cardmarket has never listed", () => {
    expect(shownPrice(null)).toBeNull();
  });

  it("keeps Cardmarket's low as a floor rather than as the price", () => {
    const price = priceOf({ low: 45.0, trend: 72.65, avg30: 66.74 });
    expect(price?.low).toBe(45.0);
    expect(price?.market).toBe(72.65);
  });

  // SVP 159 Magneton: one €10,000 sale in the chart put the trend at €801 for a
  // card listed at €70. Believing that would have made it the dearest card on
  // the page by a factor of four.
  it("disbelieves a trend wrecked by a single sale", () => {
    const price = priceOf({ low: 8.0, trend: 801.13, avg30: 391.26 });
    expect(price?.market).toBe(391.26);
  });

  // e-Card Machamp: Cardmarket files the reverse holo under the same product, so
  // the trend is drawn from two different cards.
  it("disbelieves a trend drawn from two printings", () => {
    const price = priceOf({ low: 2.5, trend: 145.5, avg30: 79.23 });
    expect(price?.market).toBe(79.23);
  });

  it("leaves a trend alone when the month agrees with it", () => {
    const price = priceOf({ low: 1.0, trend: 12.58, avg30: 11.81 });
    expect(price?.market).toBe(12.58);
  });

  // Under €5 the cheapest listing is usually a lot rather than a single card, so
  // there is nothing there a range could be accurate about.
  it("gives no range to a card too cheap to have one", () => {
    expect(priceOf({ low: 0.02, trend: 0.45, avg30: 0.41 })?.nm).toBeNull();
    expect(priceOf({ low: 2.0, trend: 3.84, avg30: 2.75 })?.nm).toBeNull();
  });

  it("still reports the market price for a card with no range", () => {
    expect(priceOf({ low: 0.02, trend: 0.45, avg30: 0.41 })?.market).toBe(0.45);
  });

  it("falls back to the month where there is no trend at all", () => {
    expect(priceOf({ low: 1.0, trend: null, avg30: 9.0 })?.market).toBe(9.0);
  });

  // A card TCGdex knows but has never seen listed is unknown, not free.
  it("is null where Cardmarket has published nothing", () => {
    expect(priceOf({ low: null, trend: null, avg30: null })).toBeNull();
  });
});
