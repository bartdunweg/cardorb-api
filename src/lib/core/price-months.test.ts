import { describe, expect, it } from "vitest";
import {
  LEGACY,
  daysFromMonths,
  legacyDays,
  monthOf,
  monthsFromDays,
  printingKey,
  shadowlessKey,
} from "./price-months.mjs";

describe("monthsFromDays", () => {
  it("puts each day at its place in its card's printing's month, in cents", () => {
    const rows = monthsFromDays([
      { tcgId: "base2-10", printing: "1st-edition-holofoil", date: "2026-09-01", price: 145.91 },
      { tcgId: "base2-10", printing: "1st-edition-holofoil", date: "2026-09-13", price: 146 },
      { tcgId: "base2-10", printing: "unlimited-holofoil", date: "2026-09-13", price: 53.23 },
      { tcgId: "base2-10", printing: "normal", date: "2026-09-13", price: null },
    ]);
    expect(rows.map((r) => `${r.printing} ${r.month}`)).toEqual([
      "1st-edition-holofoil 2026-09-01",
      "unlimited-holofoil 2026-09-01",
    ]);
    expect(rows[0]!.cents).toHaveLength(31);
    expect(rows[0]!.cents[0]).toBe(14591);
    expect(rows[0]!.cents[12]).toBe(14600);
    expect(rows[1]!.cents.filter((c: number | null) => c != null)).toEqual([5323]);
  });
});

describe("daysFromMonths", () => {
  const month = (printing: string, day: number, cents: number) => {
    const row = { tcg_id: "base2-10", printing, month: "2026-02-01", cents: Array(31).fill(null) };
    row.cents[day - 1] = cents;
    return row;
  };

  it("gives each day its printings, and the plain and foil series taken the way the app takes them", () => {
    expect(
      daysFromMonths([
        month("1st-edition-holofoil", 2, 14591),
        month("unlimited-holofoil", 2, 5323),
      ]),
    ).toEqual([
      {
        tcgId: "base2-10",
        date: "2026-02-02",
        market: 53.23,
        holo: 53.23,
        printings: { "1st-edition-holofoil": 145.91, "unlimited-holofoil": 53.23 },
      },
    ]);
  });

  it("reads a day of the old two series where no printing was stored, and a printing over them", () => {
    const days = daysFromMonths([
      month(LEGACY.market, 3, 1000),
      month(LEGACY.holo, 3, 3000),
      month(LEGACY.market, 4, 1000),
      month("normal", 4, 1100),
    ]);
    expect(days).toEqual([
      { tcgId: "base2-10", date: "2026-02-03", market: 10, holo: 30 },
      {
        tcgId: "base2-10",
        date: "2026-02-04",
        market: 11,
        holo: null,
        printings: { normal: 11 },
      },
    ]);
  });

  it("leaves out days before `since` and past the month's end", () => {
    expect(
      daysFromMonths([month("normal", 1, 100), month("normal", 31, 999)], "2026-02-01"),
    ).toEqual([
      { tcgId: "base2-10", date: "2026-02-01", market: 1, holo: null, printings: { normal: 1 } },
    ]);
    expect(daysFromMonths([month("normal", 1, 100)], "2026-02-02")).toEqual([]);
  });
});

describe("legacyDays", () => {
  it("stores no foil figure that is the plain one", () => {
    expect(legacyDays({ tcgId: "a", date: "2026-09-02", market: 5, holo: 5 })).toHaveLength(1);
    expect(legacyDays({ tcgId: "a", date: "2026-09-02", market: 5, holo: 7 })).toHaveLength(2);
  });
});

describe("printing names", () => {
  it("spells tcgcsv's subtypes as the app's printing keys, and Shadowless under its run", () => {
    expect(printingKey("1st Edition Holofoil")).toBe("1st-edition-holofoil");
    expect(shadowlessKey("unlimited-holofoil")).toBe("shadowless-holofoil");
    expect(shadowlessKey("normal")).toBe("shadowless");
    expect(shadowlessKey("1st-edition-holofoil")).toBe("1st-edition-holofoil");
    expect(monthOf("2024-02-29")).toBe("2024-02-01");
  });
});
