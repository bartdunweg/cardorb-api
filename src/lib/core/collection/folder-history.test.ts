import { describe, expect, it } from "vitest";
import { daysFromMonths } from "../price-months.mjs";
import {
  dayTotals,
  earlyLine,
  folderSeries,
  holdingsSeries,
  joinHistory,
  earlyUntil,
  withEarlyLine,
} from "./folder-history";
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
    catalogue: "en",
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
    ...over,
  }) as CardItem;

describe("folderSeries", () => {
  it("sums each day's readings over the copies, quantity times, in whole euros", () => {
    const items = [copy({ quantity: 2 }), copy({ tcgId: "base1-4" })];
    const prices = [
      { language: "en" as const, tcgId: "base1-25", date: "2026-09-02", market: 10.4, holo: null },
      { language: "en" as const, tcgId: "base1-4", date: "2026-09-02", market: 100, holo: null },
      { language: "en" as const, tcgId: "base1-25", date: "2026-09-01", market: 10, holo: null },
      { language: "en" as const, tcgId: "base1-4", date: "2026-09-01", market: 90, holo: null },
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
      { language: "en" as const, tcgId: "base1-25", date: "2026-09-01", market: 10, holo: 30 },
      { language: "en" as const, tcgId: "base1-4", date: "2026-09-01", market: 5, holo: null },
    ];
    expect(folderSeries(items, prices)).toEqual([
      { date: "2026-09-01", value: 35, cards: 3, priced: 2, unpriced: 1 },
    ]);
  });

  it("values the wishlist: every wish once, owned copies left out", () => {
    const items = [copy({ owned: false, quantity: 3 }), copy({ tcgId: "base1-4" })];
    const prices = [
      { language: "en" as const, tcgId: "base1-25", date: "2026-09-01", market: 10, holo: null },
      { language: "en" as const, tcgId: "base1-4", date: "2026-09-01", market: 100, holo: null },
    ];
    expect(folderSeries(items, prices, "wishlist")).toEqual([
      { date: "2026-09-01", value: 10, cards: 1, priced: 1, unpriced: 0 },
    ]);
  });

  it("is empty without readings", () => {
    expect(folderSeries([copy({})], [])).toEqual([]);
  });
});

describe("folderSeries and holdingsSeries across catalogues", () => {
  // neo4-106 is Shining Celebi in English and Lucky Stadium in Japanese (2026-09-14): each copy is
  // valued from its own card's readings, never the other's.
  const prices = [
    { language: "en" as const, tcgId: "neo4-106", date: "2026-09-01", market: 375, holo: null },
    { language: "ja" as const, tcgId: "neo4-106", date: "2026-09-01", market: 9, holo: null },
    { language: "ja" as const, tcgId: "neo4-106", date: "2026-09-02", market: 10, holo: null },
  ];
  const celebi = copy({ tcgId: "neo4-106", catalogue: "en", id: "celebi" });
  const stadium = copy({ tcgId: "neo4-106", catalogue: "ja", language: "ja", id: "stadium" });

  it("values each copy at its own catalogue's card", () => {
    expect(folderSeries([celebi], prices).map((p) => p.value)).toEqual([375, 375]);
    expect(folderSeries([stadium], prices).map((p) => p.value)).toEqual([9, 10]);
  });

  it("draws the Home line the same way", () => {
    expect(holdingsSeries([celebi, stadium], prices).map((p) => [p.date, p.value])).toEqual([
      ["2026-09-01", 384],
      ["2026-09-02", 385],
    ]);
  });
});

describe("folderSeries, a day without a reading", () => {
  /*
   * Kanto on Home, 2026-09-14: EUR 19,750 on the 12th, 16,200 on the 13th, 19,794 on the 14th. The
   * 13th has no reading at all for 184 held promos and gallery cards (the old snapshot wrote them
   * only a `market` series that day, which #444 deleted), so 36 copies, Pikachu with Grey Felt Hat
   * twice among them, counted as unpriced for one day. The Home line already carries a card's last
   * reading over such a day (holdingsSeries); a binder's line did not.
   */
  const month = (tcgId: string, printing: string, days: Record<number, number>) => ({
    language: "en" as const,
    tcg_id: tcgId,
    printing,
    month: "2026-09-01",
    cents: Array.from({ length: 31 }, (_, i) => days[i + 1] ?? null),
  });

  it("values a card at its last reading on a day its printing month has no figure", () => {
    const items = [
      copy({ tcgId: "svp-085", finish: "normal", quantity: 2 }),
      copy({ tcgId: "sv03.5-170", finish: "holo", id: "row-2" }),
    ];
    const prices = daysFromMonths([
      month("svp-085", "normal", { 12: 93193, 14: 93154 }),
      month("sv03.5-170", "holofoil", { 12: 8238, 13: 8100, 14: 8137 }),
    ]);
    expect(folderSeries(items, prices)).toEqual([
      {
        date: "2026-09-12",
        value: Math.round(2 * 931.93 + 82.38),
        cards: 3,
        priced: 3,
        unpriced: 0,
      },
      { date: "2026-09-13", value: Math.round(2 * 931.93 + 81), cards: 3, priced: 3, unpriced: 0 },
      {
        date: "2026-09-14",
        value: Math.round(2 * 931.54 + 81.37),
        cards: 3,
        priced: 3,
        unpriced: 0,
      },
    ]);
  });

  it("stops carrying a reading after two weeks, as the Home line does", () => {
    const items = [copy({ tcgId: "a" }), copy({ tcgId: "b", id: "row-2" })];
    const prices = [
      { language: "en" as const, tcgId: "a", date: "2026-08-01", market: 10, holo: null },
      { language: "en" as const, tcgId: "b", date: "2026-08-01", market: 5, holo: null },
      { language: "en" as const, tcgId: "b", date: "2026-08-15", market: 6, holo: null },
      { language: "en" as const, tcgId: "b", date: "2026-08-16", market: 7, holo: null },
    ];
    expect(folderSeries(items, prices).map((p) => [p.date, p.value, p.unpriced])).toEqual([
      ["2026-08-01", 15, 0],
      ["2026-08-15", 16, 0],
      ["2026-08-16", 7, 1],
    ]);
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
        language: "en" as const,
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
      { language: "en" as const, tcgId: "base1-4", date: "2024-02-17", market: 100, holo: null },
      { language: "en" as const, tcgId: "base1-25", date: "2024-02-17", market: 5, holo: null },
      { language: "en" as const, tcgId: "base1-4", date: "2024-02-24", market: 110, holo: null },
      { language: "en" as const, tcgId: "base1-25", date: "2024-02-24", market: 6, holo: null },
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
      { language: "en" as const, tcgId: "base1-25", date: "2024-02-17", market: 5, holo: null },
      { language: "en" as const, tcgId: "base1-4", date: "2024-02-24", market: 100, holo: null },
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
    const prices = [
      { language: "en" as const, tcgId: "sv01-1", date: "2024-02-17", market: 1, holo: 4 },
    ];
    expect(holdingsSeries(items, prices)[0]?.value).toBe(4);
  });

  // 2026-09-13: weekdays had readings for only the cards held when the nightly series began, and
  // 08-16's were all empty, so the line fell from EUR 40,000 to 28,000 and to zero between Saturdays.
  it("values a card at its last reading on a day without one, and not past two weeks", () => {
    const items = [copy({ tcgId: "base1-4" }), copy({ tcgId: "svp-1" })];
    const prices = [
      { language: "en" as const, tcgId: "base1-4", date: "2026-08-15", market: 100, holo: null },
      { language: "en" as const, tcgId: "svp-1", date: "2026-08-15", market: 10, holo: null },
      { language: "en" as const, tcgId: "base1-4", date: "2026-08-16", market: null, holo: null },
      { language: "en" as const, tcgId: "base1-4", date: "2026-08-17", market: 102, holo: null },
      { language: "en" as const, tcgId: "base1-4", date: "2026-08-30", market: 104, holo: null },
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
      { language: "en" as const, tcgId: "old", date: "2025-02-08", market: 10, holo: null },
      { language: "en" as const, tcgId: "old", date: "2025-03-28", market: 10, holo: null },
      { language: "en" as const, tcgId: "preorder", date: "2025-03-28", market: 5, holo: null },
    ];
    expect(holdingsSeries(items, prices)).toEqual([
      { date: "2025-02-08", value: 10, cards: 2, priced: 1, unpriced: 1, added: 0, addedValue: 0 },
      { date: "2025-03-28", value: 15, cards: 3, priced: 2, unpriced: 1, added: 1, addedValue: 5 },
    ]);
  });

  it("draws no point before the first copy was added", () => {
    const items = [copy({ tcgId: "base1-4", acquiredAt: "2025-01-01T00:00:00Z" })];
    const prices = [
      { language: "en" as const, tcgId: "base1-4", date: "2024-02-17", market: 100, holo: null },
      { language: "en" as const, tcgId: "base1-4", date: "2025-01-04", market: 120, holo: null },
    ];
    expect(holdingsSeries(items, prices).map((p) => p.date)).toEqual(["2025-01-04"]);
  });
});

describe("joinHistory", () => {
  const point = (date: string, value: number) => ({
    date,
    value,
    cards: 1,
    priced: 1,
    unpriced: 0,
  });

  // Aylan's account, 2026-09-15: the nightly points read €932.00, €931.93, €931.54, €931.54 while her
  // one card's line read €932, €928, €933, €933. The recent days are the card lines summed.
  it("keeps the stored points before the recent series and the recent series from its first day", () => {
    const stored = [point("2026-06-01", 900), point("2026-09-12", 932), point("2026-09-13", 932)];
    const recent = [point("2026-09-12", 932), point("2026-09-13", 928), point("2026-09-14", 933)];
    expect(joinHistory(stored, recent).map((p) => [p.date, p.value])).toEqual([
      ["2026-06-01", 900],
      ["2026-09-12", 932],
      ["2026-09-13", 928],
      ["2026-09-14", 933],
    ]);
  });

  it("answers the stored points where there is no recent series", () => {
    const stored = [point("2026-09-12", 932)];
    expect(joinHistory(stored, [])).toBe(stored);
  });
});

describe("the line before the first stored point", () => {
  const reading = (tcgId: string, date: string, market: number | null) => ({
    language: "en" as const,
    tcgId,
    date,
    market,
    holo: null,
  });
  it("counts every copy held now on every day, also before it was added", () => {
    // Bart, 2026-09-19: the price history of your cards, also before you added them.
    const items = [copy({ acquiredAt: "2026-09-17T10:00:00Z" })];
    const line = earlyLine(
      [
        dayTotals(
          items,
          [reading("base1-25", "2026-09-01", 10), reading("base1-25", "2026-09-02", 12)],
          "2026-09-01",
          "2026-09-03",
        ),
      ],
      1,
    );
    expect(line).toEqual([
      { date: "2026-09-01", value: 10, cards: 1, priced: 1, unpriced: 0 },
      { date: "2026-09-02", value: 12, cards: 1, priced: 1, unpriced: 0 },
    ]);
  });

  it("ends the day before `until` and starts no earlier than `from`", () => {
    const line = earlyLine(
      [
        dayTotals(
          [copy({})],
          [
            reading("base1-25", "2026-08-31", 9),
            reading("base1-25", "2026-09-01", 10),
            reading("base1-25", "2026-09-03", 30),
          ],
          "2026-09-01",
          "2026-09-03",
        ),
      ],
      1,
    );
    expect(line.map((p) => p.date)).toEqual(["2026-09-01", "2026-09-02"]);
    // 09-02 has no reading of its own: the card stands at its last one, as the Home line does.
    expect(line[1]!.value).toBe(10);
  });

  it("adds chunks up to what the whole collection sums to, and prices a day from any chunk", () => {
    const pikachu = copy({ quantity: 2 });
    const charizard = copy({ tcgId: "base1-4" });
    const unknown = copy({ tcgId: null });
    const prices = [
      reading("base1-25", "2026-09-01", 10.4),
      reading("base1-4", "2026-09-01", 100.3),
      reading("base1-4", "2026-09-02", 110.3),
    ];
    const whole = folderSeries([pikachu, charizard, unknown], prices);
    const line = earlyLine(
      [
        dayTotals([pikachu], prices.slice(0, 1), "2026-09-01", "2026-09-03"),
        dayTotals([charizard], prices.slice(1), "2026-09-01", "2026-09-03"),
      ],
      4,
    );
    expect(line).toEqual(whole);
    // Pikachu has no reading on 09-02, so its chunk alone has no day then; it still counts.
    expect(line[1]).toEqual({ date: "2026-09-02", value: 131, cards: 4, priced: 3, unpriced: 1 });
  });

  it("leaves out a day on which no copy has a price, rather than drawing it as zero", () => {
    const line = earlyLine(
      [
        dayTotals(
          [copy({})],
          [reading("base1-25", "2026-09-01", null), reading("base1-25", "2026-09-03", 10)],
          "2026-09-01",
          "2026-09-04",
        ),
      ],
      1,
    );
    expect(line.map((p) => p.date)).toEqual(["2026-09-03"]);
  });

  it("answers nothing for a collection with no priced card", () => {
    expect(earlyLine([], 3)).toEqual([]);
  });
});

describe("withEarlyLine", () => {
  const point = (date: string, value: number, cards = 1, priced = cards) => ({
    date,
    value,
    cards,
    priced,
    unpriced: cards - priced,
  });

  it("lets the stored points win every day they cover and ends the early line the day before", () => {
    const early = [point("2026-09-15", 1), point("2026-09-16", 2), point("2026-09-17", 3)];
    const stored = [point("2026-09-17", 281), point("2026-09-18", 282)];
    const line = withEarlyLine(early, stored);
    expect(line).toEqual([
      point("2026-09-15", 1),
      point("2026-09-16", 2),
      point("2026-09-17", 281),
      point("2026-09-18", 282),
    ]);
    expect(new Set(line.map((p) => p.date)).size).toBe(line.length);
  });

  it("replaces an import's dip with the worked-out day", () => {
    // jasperdenouden: one card stored 09-09 to 09-13, the import of 2,261 on 09-14.
    const early = [
      point("2026-09-08", 8040, 2265, 2264),
      point("2026-09-09", 8050, 2265, 2264),
      point("2026-09-10", 8060, 2265, 2264),
    ];
    const stored = [
      point("2026-09-09", 122, 1),
      point("2026-09-10", 122, 1),
      point("2026-09-11", 7761, 2261),
    ];
    expect(withEarlyLine(early, stored).map((p) => [p.date, p.value])).toEqual([
      ["2026-09-08", 8040],
      ["2026-09-09", 8050],
      ["2026-09-10", 8060],
      ["2026-09-11", 7761],
    ]);
  });

  it("says the night after a replaced dip added nothing, since the line already holds its cards", () => {
    const early = [point("2026-09-13", 8038, 2265, 2264)];
    const stored = [
      point("2026-09-13", 85, 1),
      { ...point("2026-09-14", 7761, 2261), added: 2260, addedValue: 7700 },
      { ...point("2026-09-16", 8067, 2265), added: 4, addedValue: 300 },
    ];
    const line = withEarlyLine(early, stored);
    expect(line[1]).toMatchObject({ date: "2026-09-14", added: 0, addedValue: 0 });
    expect(line[2]).toMatchObject({ date: "2026-09-16", added: 4, addedValue: 300 });
  });

  it("replaces a leading run alone, not a dip after a night that held the collection", () => {
    const early = [point("2026-09-09", 800, 10, 10), point("2026-09-11", 810, 10, 10)];
    const stored = [point("2026-09-10", 790, 10), point("2026-09-11", 20, 1)];
    expect(withEarlyLine(early, stored).map((p) => p.value)).toEqual([800, 790, 20]);
  });

  it("keeps the stored point of a day a card was sold", () => {
    const early = [point("2026-09-09", 8050, 2265, 2264), point("2026-09-10", 8060, 2265, 2264)];
    const stored = [point("2026-09-09", 8040, 2264), point("2026-09-10", 8030, 2264)];
    expect(withEarlyLine(early, stored)).toEqual(stored);
  });

  it("keeps a stored point at half of what is priced or more", () => {
    const early = [point("2026-09-09", 100, 10, 10)];
    expect(withEarlyLine(early, [point("2026-09-09", 50, 5)])[0]!.value).toBe(50);
    expect(withEarlyLine(early, [point("2026-09-09", 40, 4)])[0]!.value).toBe(100);
  });

  it("answers the stored points alone for an account with nothing to prepend", () => {
    const stored = [point("2026-09-17", 281)];
    expect(withEarlyLine([], stored)).toBe(stored);
  });

  it("answers the early line alone where nothing is stored", () => {
    const early = [point("2026-09-16", 2)];
    expect(withEarlyLine(early, [])).toEqual(early);
  });
});

describe("earlyUntil", () => {
  const point = (date: string, cards: number) => ({
    date,
    value: 1,
    cards,
    priced: cards,
    unpriced: 0,
  });

  it("is the first stored point where no night held under half of today's copies", () => {
    expect(earlyUntil([point("2026-09-17", 1), point("2026-09-18", 1)], 1)).toBe("2026-09-17");
    expect(earlyUntil([point("2026-09-17", 2264)], 2265)).toBe("2026-09-17");
  });

  it("reaches to the day after the leading nights that held under half", () => {
    const stored = [
      point("2026-09-09", 1),
      point("2026-09-13", 1),
      point("2026-09-14", 2261),
      point("2026-09-18", 2265),
    ];
    expect(earlyUntil(stored, 2265)).toBe("2026-09-14");
  });

  it("stops at the first night that held the collection", () => {
    expect(earlyUntil([point("2026-09-09", 10), point("2026-09-12", 1)], 10)).toBe("2026-09-09");
  });

  it("is null with nothing stored", () => {
    expect(earlyUntil([], 5)).toBeNull();
  });
});
