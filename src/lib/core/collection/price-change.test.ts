import { describe, expect, it } from "vitest";
import type { CardItem } from "./items";
import { priceChanges, sortByChange } from "./price-change";

const copy = (over: Partial<CardItem>): CardItem =>
  ({
    id: "row",
    name: "Pikachu",
    number: "25",
    tcgId: "base1-25",
    catalogue: "en",
    owned: true,
    finish: null,
    edition: null,
    quantity: 1,
    ...over,
  }) as CardItem;

const point = (tcgId: string, date: string, market: number | null, holo: number | null = null) => ({
  language: "en" as const,
  tcgId,
  date,
  market,
  holo,
});

describe("priceChanges", () => {
  it("compares the first and last reading inside the window, per copy and over the copies", () => {
    const items = [copy({ id: "a", quantity: 2 })];
    const points = [
      point("base1-25", "2026-08-01", 5),
      point("base1-25", "2026-09-01", 10),
      point("base1-25", "2026-09-07", 12),
      point("base1-25", "2026-09-14", 13),
      point("base1-25", "2026-09-20", 99),
    ];
    expect(priceChanges(items, points, "2026-09-01", "2026-09-14").get("a")).toEqual({
      was: 10,
      now: 13,
      change: 3,
      total: 6,
      from: "2026-09-01",
      to: "2026-09-14",
    });
  });

  it("prices a reverse holo at the foil, and leaves out a card with one reading or none", () => {
    const items = [
      copy({ id: "rev", finish: "reverse-holo" }),
      copy({ id: "one", tcgId: "base1-4" }),
      copy({ id: "none", tcgId: null }),
    ];
    const points = [
      point("base1-25", "2026-09-01", 1, 4),
      point("base1-25", "2026-09-10", 1, 6),
      point("base1-4", "2026-09-10", 100),
    ];
    const changes = priceChanges(items, points, "2026-09-01", "2026-09-14");
    expect(changes.get("rev")?.change).toBe(2);
    expect(changes.has("one")).toBe(false);
    expect(changes.has("none")).toBe(false);
  });

  it("does not match a Japanese card's readings to an English card with the same id", () => {
    const items = [copy({ id: "en", tcgId: "neo4-106", catalogue: "en" })];
    const points = [
      { ...point("neo4-106", "2026-09-01", 10), language: "ja" as const },
      { ...point("neo4-106", "2026-09-10", 50), language: "ja" as const },
    ];
    expect(priceChanges(items, points, "2026-09-01", "2026-09-14").has("en")).toBe(false);
  });
});

describe("sortByChange", () => {
  const items = [
    copy({ id: "flat" }),
    copy({ id: "up" }),
    copy({ id: "down" }),
    copy({ id: "big" }),
  ];
  const changes = new Map([
    ["up", { was: 1, now: 2, change: 1, total: 1, from: "a", to: "b" }],
    ["down", { was: 5, now: 2, change: -3, total: -3, from: "a", to: "b" }],
    ["big", { was: 1, now: 9, change: 8, total: 8, from: "a", to: "b" }],
  ]);
  it("puts the biggest gain first, and the ones without a change last", () => {
    expect(sortByChange(items, changes).map((it) => it.id)).toEqual(["big", "up", "down", "flat"]);
  });
  it("puts the biggest loss first on asc", () => {
    expect(sortByChange(items, changes, "asc").map((it) => it.id)).toEqual([
      "down",
      "up",
      "big",
      "flat",
    ]);
  });
});
