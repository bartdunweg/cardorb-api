import { describe, expect, it } from "vitest";
import {
  JUMP_FLOOR_CENTS,
  JUMP_RATIO,
  LEGACY,
  daysFromMonths,
  daysOfMonthRow,
  priceJumps,
  legacyDays,
  monthOf,
  monthsFromDays,
  printingKey,
  runKey,
  runLinksOf,
  shadowlessKey,
} from "./price-months.mjs";

describe("monthsFromDays", () => {
  it("puts each day at its place in its card's printing's month, in cents", () => {
    const rows = monthsFromDays([
      {
        language: "en",
        tcgId: "base2-10",
        printing: "1st-edition-holofoil",
        date: "2026-09-01",
        price: 145.91,
      },
      {
        language: "en",
        tcgId: "base2-10",
        printing: "1st-edition-holofoil",
        date: "2026-09-13",
        price: 146,
      },
      {
        language: "en",
        tcgId: "base2-10",
        printing: "unlimited-holofoil",
        date: "2026-09-13",
        price: 53.23,
      },
      { language: "en", tcgId: "base2-10", printing: "normal", date: "2026-09-13", price: null },
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

describe("monthsFromDays across catalogues", () => {
  // neo4-106 is Shining Celebi in English and Lucky Stadium in Japanese (2026-09-14).
  it("keeps an English and a Japanese card of one id in rows of their own", () => {
    const rows = monthsFromDays([
      { language: "en", tcgId: "neo4-106", printing: "holofoil", date: "2026-09-14", price: 375 },
      { language: "ja", tcgId: "neo4-106", printing: "holofoil", date: "2026-09-14", price: 9 },
    ]);
    expect(rows.map((r) => [r.language, r.tcg_id, r.cents[13]])).toEqual([
      ["en", "neo4-106", 37500],
      ["ja", "neo4-106", 900],
    ]);
  });

  it("refuses a day that does not say which catalogue its card is from", () => {
    expect(() =>
      monthsFromDays([
        { tcgId: "neo4-106", printing: "holofoil", date: "2026-09-14", price: 375 } as never,
      ]),
    ).toThrow(/language/);
  });
});

describe("daysFromMonths", () => {
  const month = (printing: string, day: number, cents: number, language: "en" | "ja" = "en") => {
    const row = {
      language,
      tcg_id: "base2-10",
      printing,
      month: "2026-02-01",
      cents: Array(31).fill(null),
    };
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
        language: "en",
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
      { language: "en", tcgId: "base2-10", date: "2026-02-03", market: 10, holo: 30 },
      {
        language: "en",
        tcgId: "base2-10",
        date: "2026-02-04",
        market: 11,
        holo: null,
        printings: { normal: 11 },
      },
    ]);
  });

  // Base Set Charizard: its unlimited holo on most days, its 1st Edition on a few more.
  it("follows one printing on every day, and leaves a day without it out of the series", () => {
    const rows = [
      month("holofoil", 1, 86900),
      month("1st-edition-holofoil", 1, 526600),
      month("1st-edition-holofoil", 2, 526600),
      month("holofoil", 3, 87000),
      month("1st-edition-holofoil", 3, 527000),
    ];
    expect(daysFromMonths(rows).map((d) => [d.date, d.market, d.holo])).toEqual([
      ["2026-02-01", 869, 869],
      ["2026-02-02", null, null],
      ["2026-02-03", 870, 870],
    ]);
  });

  // ex8-15: a scattered "normal" series on 95 days beside its holo on 306.
  it("draws the holo where the card's plain printing is a stray few readings", () => {
    const rows = [1, 2, 3, 4, 5]
      .flatMap((d) => [month("holofoil", d, 2200 + d)])
      .concat([month("normal", 3, 300)]);
    expect(daysFromMonths(rows).map((d) => d.market)).toEqual([22.01, 22.02, 22.03, 22.04, 22.05]);
  });

  // The same id, two cards: each its own days, its own printing chosen, and each point says which.
  // Keyed on the id alone, the Japanese card's plain days made the English holo's line plain.
  it("reads an English and a Japanese card of one id as two lines", () => {
    const days = daysFromMonths([
      month("unlimited-holofoil", 5, 37500, "en"),
      month("normal", 5, 100, "ja"),
      month("normal", 6, 110, "ja"),
    ]);
    expect(days.map((d) => [d.language, d.date, d.market, d.holo, d.printings])).toEqual([
      ["en", "2026-02-05", 375, 375, { "unlimited-holofoil": 375 }],
      ["ja", "2026-02-05", 1, null, { normal: 1 }],
      ["ja", "2026-02-06", 1.1, null, { normal: 1.1 }],
    ]);
  });

  // Base Set Charizard's 1st Edition, July 2026: TCGplayer's market price $10,000 on most days and
  // $250 for eleven, off a sale nobody else made. Stored as it came; read as the $10,000 held.
  it("holds a printing's last figure over one five times off its median", () => {
    const july = (printing: string, days: Record<number, number>) => ({
      language: "en" as const,
      tcg_id: "base1-4",
      printing,
      month: "2026-07-01",
      cents: Array.from({ length: 31 }, (_, i) => days[i + 1] ?? null),
    });
    const first = Object.fromEntries(
      Array.from({ length: 31 }, (_, i) => [i + 1, i >= 11 && i < 22 ? 21900 : 874500 + i]),
    );
    const days = daysFromMonths([
      july("1st-edition-holofoil", first),
      july("holofoil", { 12: 69000 }),
    ]);
    const line = days.map((d) => d.printings?.["1st-edition-holofoil"]);
    expect(line).toHaveLength(31);
    // The 11th's figure stands until the 23rd's sale, and the 12th keeps its holo beside it.
    expect(line.slice(10, 23)).toEqual([...Array(12).fill(8745.1), 8745.22]);
    expect(days.find((d) => d.date === "2026-07-12")?.printings).toEqual({
      "1st-edition-holofoil": 8745.1,
      holofoil: 690,
    });
    // A held figure says what it stands in for, so today's price can be held the same way.
    expect(days.find((d) => d.date === "2026-07-12")?.held).toEqual({
      "1st-edition-holofoil": 219,
    });
    expect(days.find((d) => d.date === "2026-07-11")).not.toHaveProperty("held");
  });

  it("leaves out a stray figure with nothing before it to hold", () => {
    const cents = Array.from({ length: 31 }, (_, i) => (i < 2 ? 100 : 5000));
    const days = daysFromMonths([
      { language: "en", tcg_id: "base1-2", printing: "holofoil", month: "2026-07-01", cents },
    ]);
    expect(days.map((d) => d.date)[0]).toBe("2026-07-03");
    expect(days).toHaveLength(29);
  });

  // June 2026: more days at €260 than at €8,600, beside the unlimited holo at €470, after a May at
  // €8,600 every day. The median of June alone would have kept the €260 and dropped the €8,600.
  it("holds a 1st Edition figure over one under the card's unlimited run, where it is typically dearer", () => {
    const run = (printing: string, month: string, cents: (day: number) => number) => ({
      language: "en" as const,
      tcg_id: "base1-4",
      printing,
      month,
      cents: Array.from({ length: 31 }, (_, i) => (i < 30 ? cents(i + 1) : null)),
    });
    const days = daysFromMonths([
      run("1st-edition-holofoil", "2026-05-01", () => 860000),
      run("holofoil", "2026-05-01", () => 47000),
      run("1st-edition-holofoil", "2026-06-01", (day) => (day <= 18 ? 25800 : 860000)),
      run("holofoil", "2026-06-01", () => 47000),
    ]);
    const june = days.filter((d) => d.date >= "2026-06-01");
    expect(june.map((d) => d.printings?.["1st-edition-holofoil"] ?? null)).toEqual(
      Array(30).fill(8600),
    );
    // A card whose stamped run sells under its unlimited one keeps every day of it (neo4-11).
    const cheaper = daysFromMonths([
      run("1st-edition-holofoil", "2026-06-01", () => 15000),
      run("holofoil", "2026-06-01", () => 17000),
    ]);
    expect(cheaper.filter((d) => d.printings?.["1st-edition-holofoil"] === 150)).toHaveLength(30);
  });

  // ex11-12's reverse: €86 through August, €905 from 1 September once #463 read its own figure.
  it("takes a new level at the end of the line once it has held a week", () => {
    const line = (days: number) => [
      {
        language: "en" as const,
        tcg_id: "ex11-12",
        printing: "reverse-holofoil",
        month: "2026-08-01",
        cents: Array.from({ length: 31 }, () => 8600),
      },
      {
        language: "en" as const,
        tcg_id: "ex11-12",
        printing: "reverse-holofoil",
        month: "2026-09-01",
        cents: Array.from({ length: 31 }, (_, i) => (i < days ? 90500 : null)),
      },
    ];
    const last = (days: number) => daysFromMonths(line(days)).at(-1)!;
    expect(last(6).printings).toEqual({ "reverse-holofoil": 86 });
    expect(last(7).printings).toEqual({ "reverse-holofoil": 905 });
    expect(last(7)).not.toHaveProperty("held");
  });

  it("keeps a climb under five times, and a printing with too few figures to judge", () => {
    const rising = {
      language: "en" as const,
      tcg_id: "sv3pt5-199",
      printing: "holofoil",
      month: "2026-07-01",
      cents: Array.from({ length: 31 }, (_, i) => (i < 15 ? 1000 : 4000)),
    };
    const sparse = { ...rising, tcg_id: "base1-2", cents: [100, 900, ...Array(29).fill(null)] };
    expect(daysFromMonths([rising])).toHaveLength(31);
    expect(daysFromMonths([sparse]).map((d) => d.market)).toEqual([1, 9]);
  });

  // ecard2-40's normal: €95 all August, 28 cents on the 31st and on 1 September, €95 again after.
  // A card nobody owns, and the hold is the same one a held card's line gets.
  it("holds a cheap stray day on a line nobody owns", () => {
    const line = (month: string, cents: (day: number) => number | null) => ({
      language: "en" as const,
      tcg_id: "ecard2-40",
      printing: "normal",
      month,
      cents: Array.from({ length: 31 }, (_, i) => cents(i + 1)),
    });
    const days = daysFromMonths([
      line("2026-08-01", (day) => (day === 31 ? 28 : 9508)),
      line("2026-09-01", (day) => (day <= 1 ? 28 : day <= 19 ? 9561 : null)),
    ]);
    const on = (date: string) => days.find((d) => d.date === date);
    expect(on("2026-08-31")?.printings).toEqual({ normal: 95.08 });
    expect(on("2026-08-31")?.held).toEqual({ normal: 0.28 });
    expect(on("2026-09-01")?.printings).toEqual({ normal: 95.08 });
  });

  // SVLN-004's normal read 4 cents where its neighbours read 5: five times, at that level, is one
  // cent of TCGplayer's own conversion.
  it("judges nothing on a line under a quarter", () => {
    const cents = Array.from({ length: 31 }, (_, i) => (i === 10 ? 1 : 20));
    const days = daysFromMonths([
      { language: "en", tcg_id: "svlen-004", printing: "normal", month: "2026-07-01", cents },
    ]);
    expect(days.find((d) => d.date === "2026-07-11")?.printings).toEqual({ normal: 0.01 });
    expect(days.some((d) => d.held)).toBe(false);
  });

  // SM7a-072's holofoil held €0.12 with €0.12: its window's median had moved to the other level,
  // and the sheet was told a day was corrected that read exactly the same afterwards.
  it("puts a figure back unmarked where the figure before it says the same thing", () => {
    const low = Array.from({ length: 30 }, () => 100);
    const days = daysFromMonths([
      {
        language: "en",
        tcg_id: "sm7a-072",
        printing: "holofoil",
        month: "2026-07-01",
        cents: [...low, 5000],
      },
      {
        language: "en",
        tcg_id: "sm7a-072",
        printing: "holofoil",
        month: "2026-08-01",
        cents: Array.from({ length: 31 }, (_, i) => (i === 0 ? 100 : 5000)),
      },
    ]);
    // 1 August reads €1 against a window whose median is €50, so it is judged stray; the last
    // figure before it is €1 too, so the day keeps what TCGplayer sent and says nothing was held.
    const first = days.find((d) => d.date === "2026-08-01");
    expect(first?.printings).toEqual({ holofoil: 1 });
    expect(first).not.toHaveProperty("held");
  });

  it("leaves out days before `since` and past the month's end", () => {
    expect(
      daysFromMonths([month("normal", 1, 100), month("normal", 31, 999)], "2026-02-01"),
    ).toEqual([
      {
        language: "en",
        tcgId: "base2-10",
        date: "2026-02-01",
        market: 1,
        holo: null,
        printings: { normal: 1 },
      },
    ]);
    expect(daysFromMonths([month("normal", 1, 100)], "2026-02-02")).toEqual([]);
  });
});

describe("priceJumps", () => {
  const line = (key: string, days: [string, number][]) => ({ key, days });

  it("counts a jump on the higher reading's level, so a cheap flip on a dear line is seen", () => {
    // ecard2-40: €95.08 to 28 cents and back. The check asked for €10 on both sides and saw
    // neither day; a euro on the higher reading sees both.
    const jumps = priceJumps([
      line("en|ecard2-40|normal", [
        ["2026-08-30", 9508],
        ["2026-08-31", 28],
        ["2026-09-01", 28],
        ["2026-09-02", 9561],
      ]),
    ]);
    expect(jumps.map((j) => [j.date, j.from, j.to])).toEqual([
      ["2026-08-31", 9508, 28],
      ["2026-09-02", 28, 9561],
    ]);
  });

  it("says nothing about a line under the floor, or a move under the ratio", () => {
    expect(JUMP_RATIO).toBe(10);
    expect(JUMP_FLOOR_CENTS).toBe(100);
    // A ten-times move whose higher reading is 90 cents: a cent against ten.
    expect(
      priceJumps([
        line("ja|SVLN-004|normal", [
          ["2026-08-20", 9],
          ["2026-08-21", 90],
        ]),
      ]),
    ).toEqual([]);
    // A real move of nine times, at a real level: not a jump.
    expect(
      priceJumps([
        line("en|sv3pt5-199|holofoil", [
          ["2026-08-20", 1000],
          ["2026-08-21", 8999],
        ]),
      ]),
    ).toEqual([]);
  });

  it("reports from `since` on, and reads the reading before it", () => {
    const days: [string, number][] = [
      ["2026-08-01", 100],
      ["2026-08-02", 9000],
      ["2026-08-03", 9000],
    ];
    expect(priceJumps([line("a", days)], { since: "2026-08-02" })).toHaveLength(1);
    expect(priceJumps([line("a", days)], { since: "2026-08-03" })).toEqual([]);
  });

  it("takes the thresholds it is given", () => {
    const days: [string, number][] = [
      ["2026-08-01", 100],
      ["2026-08-02", 500],
    ];
    expect(priceJumps([line("a", days)], { ratio: 4 })).toHaveLength(1);
    expect(priceJumps([line("a", days)], { ratio: 4, floorCents: 1000 })).toEqual([]);
  });

  it("reads a month row's days and leaves its empty ones out", () => {
    expect(
      daysOfMonthRow({ month: "2026-02-01", cents: [100, null, 300, ...Array(28).fill(9)] }),
    ).toEqual([
      ["2026-02-01", 100],
      ["2026-02-03", 300],
      ...Array.from({ length: 25 }, (_, i) => [`2026-02-${String(i + 4).padStart(2, "0")}`, 9]),
    ]);
    expect(daysOfMonthRow({ month: "2026-02-01", cents: null })).toEqual([]);
  });
});

describe("legacyDays", () => {
  it("stores no foil figure that is the plain one", () => {
    const day = { language: "en" as const, tcgId: "a", date: "2026-09-02" };
    expect(legacyDays({ ...day, market: 5, holo: 5 })).toHaveLength(1);
    expect(legacyDays({ ...day, market: 5, holo: 7 })).toHaveLength(2);
  });
});

describe("printing names", () => {
  it("spells tcgcsv's subtypes as the app's printing keys, and Shadowless under its run", () => {
    expect(printingKey("1st Edition Holofoil")).toBe("1st-edition-holofoil");
    expect(shadowlessKey("unlimited-holofoil")).toBe("shadowless-holofoil");
    expect(shadowlessKey("normal")).toBe("shadowless");
    expect(shadowlessKey("1st-edition-holofoil")).toBe("1st-edition-holofoil");
    expect(runKey("blue-border", "normal")).toBe("blue-border");
    expect(
      runLinksOf({ shadowless: { productId: 1 }, blueBorder: { productId: 2, groupId: 3 } }),
    ).toEqual([
      { edition: "shadowless", productId: 1 },
      { edition: "blue-border", productId: 2, groupId: 3 },
    ]);
    expect(runLinksOf(null)).toEqual([]);
    expect(monthOf("2024-02-29")).toBe("2024-02-01");
  });
});
