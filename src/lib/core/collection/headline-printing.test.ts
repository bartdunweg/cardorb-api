import { describe, expect, it } from "vitest";
import type { Printing } from "../catalogue/card-printings";
import {
  editionOfSeries,
  headlineChanges,
  headlinePrinting,
  readFromDay,
} from "./headline-printing";
import type { CardPricePoint } from "./movers";
import { daysFromMonths } from "../price-months.mjs";
import lugiaRows from "../lugia-aquapolis.fixture.json";

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

  /* #561: a printing listed and never sold carries its lowest listing. A market figure anywhere still
     comes first; where there is none, the first listed printing in the sheet's order is the tile's. */
  it("takes a market figure over an earlier printing's listing", () => {
    const listed = { market: null, listing: 2, productId: 1 };
    const got = headlinePrinting(
      [p("normal"), p("reverse-holo")],
      { normal: listed, "reverse-holofoil": usd(0.5) },
      usd(0.5),
    );
    expect(got).toMatchObject({ printing: "reverse-holo", series: "reverse-holofoil" });
  });

  it("takes the first listed printing where none has a market figure", () => {
    const listed = { market: null, listing: 2, productId: 1 };
    const got = headlinePrinting(
      [p("normal"), p("reverse-holo")],
      { "reverse-holofoil": listed },
      listed,
    );
    expect(got).toEqual({ printing: "reverse-holo", series: "reverse-holofoil", usd: listed });
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

describe("headlineChanges over a dip that came back", () => {
  // Lugia, Aquapolis: €1,213 for 14 to 16 September 2026 between weeks at about €3,900. The set page
  // asked from the 16th answered +€2,712.18 for a card that never moved.
  it("reads Lugia's week from 16 September as the €43.70 it moved, not +€2,712", () => {
    const lines = daysFromMonths(
      lugiaRows.map((r) => ({ ...r, language: "en" as const })),
      "2026-09-16",
    );
    const lugia = {
      id: "ecard2-149",
      tcgId: "ecard2-149",
      language: "en" as const,
      series: "holofoil",
    };
    expect(headlineChanges([lugia], lines, "2026-09-16", "2026-09-22").get("ecard2-149")).toEqual({
      was: 3881.97,
      now: 3925.67,
      change: 43.7,
      from: "2026-09-16",
      to: "2026-09-22",
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

describe("editionOfSeries", () => {
  it("names the run of a card sold in runs", () => {
    expect(editionOfSeries("unlimited-holofoil")).toBe("unlimited");
    expect(editionOfSeries("unlimited")).toBe("unlimited");
    expect(editionOfSeries("1st-edition-holofoil")).toBe("1st-edition");
    expect(editionOfSeries("shadowless-holofoil")).toBe("shadowless");
  });

  it("is null for a card sold in one run, or no series", () => {
    expect(editionOfSeries("holofoil")).toBeNull();
    expect(editionOfSeries("reverse-holofoil")).toBeNull();
    expect(editionOfSeries(null)).toBeNull();
  });
});
