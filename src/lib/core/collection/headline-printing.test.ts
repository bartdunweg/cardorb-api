import { describe, expect, it } from "vitest";
import type { Printing } from "../catalogue/card-printings";
import { headlineChanges, headlinePrinting, readFromDay } from "./headline-printing";
import type { CardPricePoint } from "./movers";

const p = (finish: Printing["finish"], foilPattern: Printing["foilPattern"] = null): Printing => ({
  finish,
  foilPattern,
});
const usd = (market: number, productId = 1) => ({ market, productId });

describe("headlinePrinting", () => {
  /* The disagreement this exists for: the sheet opens on Reverse, the tile showed the holo. */
  it("picks the reverse of a holo rare that has one, as the sheet opens on it", () => {
    const got = headlinePrinting(
      [p("reverse-holo"), p("holo")],
      { holofoil: usd(12), "reverse-holofoil": usd(3) },
      usd(12),
    );
    expect(got).toEqual({ printing: "reverse-holo", series: "reverse-holofoil", usd: usd(3) });
  });

  it("picks the holo of a card that is a holo only", () => {
    const got = headlinePrinting([p("holo")], { holofoil: usd(40) }, usd(40));
    expect(got).toMatchObject({ printing: "holo", series: "holofoil" });
  });

  it("puts the plain card first where it is priced", () => {
    const got = headlinePrinting(
      [p("normal"), p("reverse-holo")],
      { normal: usd(0.1), "reverse-holofoil": usd(0.5) },
      usd(0.1),
    );
    expect(got).toMatchObject({ printing: "normal", series: "normal", usd: usd(0.1) });
  });

  it("passes over a printing TCGplayer does not price to the next that it does", () => {
    const got = headlinePrinting(
      [p("normal"), p("reverse-holo"), p("holo")],
      { holofoil: usd(7) },
      usd(7),
    );
    expect(got).toMatchObject({ printing: "holo", series: "holofoil" });
  });

  it("keeps a run card on its unlimited price, whichever printing the stamp is on", () => {
    const got = headlinePrinting(
      [p("holo")],
      { "1st-edition-holofoil": usd(1085), "unlimited-holofoil": usd(519) },
      usd(519),
    );
    expect(got).toMatchObject({ printing: "holo", series: "unlimited-holofoil", usd: usd(519) });
  });

  it("reads the stamped run where it is the only one priced (Base Set Machamp)", () => {
    const got = headlinePrinting([p("holo")], { "1st-edition-holofoil": usd(30) }, usd(30));
    expect(got).toMatchObject({ printing: "holo", series: "1st-edition-holofoil" });
  });

  it("keys a patterned reverse and a foil pattern as the sheet's buttons do", () => {
    expect(
      headlinePrinting([p("poke-ball")], { "poke-ball-reverse-holofoil": usd(2) }, null),
    ).toMatchObject({ printing: "poke-ball", series: "poke-ball-reverse-holofoil" });
    expect(
      headlinePrinting([p("reverse-holo", "cosmos")], { "cosmos-reverse-holofoil": usd(2) }, null),
    ).toMatchObject({ printing: "reverse-holo/cosmos", series: "cosmos-reverse-holofoil" });
  });

  it("keeps today's figure for a card whose printings the catalogue does not list, named by its foil", () => {
    expect(headlinePrinting([], { holofoil: usd(5) }, usd(5))).toMatchObject({
      printing: "holo",
      series: "holofoil",
      usd: usd(5),
    });
  });

  it("is null where TCGplayer prices nothing", () => {
    expect(headlinePrinting([p("normal")], {}, null)).toBeNull();
  });
});

const point = (
  date: string,
  printings: Record<string, number> | undefined,
  market: number | null = null,
  holo: number | null = null,
): CardPricePoint => ({ language: "en", tcgId: "sv1-1", date, market, holo, printings });

describe("headlineChanges", () => {
  const card = { id: "sv1-1", tcgId: "sv1-1", language: "en" as const, series: "reverse-holofoil" };

  it("compares the headline printing's first and last reading inside the window", () => {
    const points = [
      point("2026-08-01", { normal: 1, "reverse-holofoil": 2 }),
      point("2026-09-01", { normal: 1, "reverse-holofoil": 2.5 }),
      point("2026-09-10", { normal: 9, "reverse-holofoil": 3.25 }),
      point("2026-09-20", { normal: 1, "reverse-holofoil": 99 }),
    ];
    expect(headlineChanges([card], points, "2026-08-15", "2026-09-18").get("sv1-1")).toEqual({
      was: 2.5,
      now: 3.25,
      change: 0.75,
      from: "2026-09-01",
      to: "2026-09-10",
    });
  });

  it("reads its own series only, never another printing's", () => {
    const points = [point("2026-09-01", { normal: 1 }), point("2026-09-10", { normal: 2 })];
    expect(headlineChanges([card], points, "2026-09-01", "2026-09-18").has("sv1-1")).toBe(false);
  });

  it("has no change on fewer than two readings", () => {
    const points = [point("2026-09-01", { "reverse-holofoil": 2 })];
    expect(headlineChanges([card], points, "2026-09-01", "2026-09-18").size).toBe(0);
  });

  it("reads a reading from before printings by the old foil series", () => {
    const points = [point("2026-09-01", undefined, 1, 4), point("2026-09-10", undefined, 1, 5)];
    expect(headlineChanges([card], points, "2026-09-01", "2026-09-18").get("sv1-1")).toMatchObject({
      was: 4,
      now: 5,
      change: 1,
    });
  });
});

describe("readFromDay", () => {
  const today = "2026-09-18";
  it("takes a day inside the past year", () => {
    expect(readFromDay("2026-06-18", today)).toEqual({ from: "2026-06-18" });
    expect(readFromDay("2025-09-18", today)).toEqual({ from: "2025-09-18" });
  });
  it("refuses a day that does not exist, one to come and one past a year", () => {
    expect(readFromDay("2026-02-30", today)).toHaveProperty("error");
    expect(readFromDay("18-09-2026", today)).toHaveProperty("error");
    expect(readFromDay("2026-09-19", today)).toHaveProperty("error");
    expect(readFromDay("2025-09-17", today)).toHaveProperty("error");
  });
});
