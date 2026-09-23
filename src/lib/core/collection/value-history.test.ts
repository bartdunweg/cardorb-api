import { describe, expect, it } from "vitest";
import { CARRY_DAYS, holdingsSeries } from "./folder-history";
import { DIP_DAYS } from "../price-months.mjs";
import type { CardItem } from "./items";
import type { CardPricePoint } from "./movers";
import {
  HISTORY_DAILY_FROM,
  HISTORY_WINDOW_DAYS,
  needsHistoryRebuild,
  nightReadFrom,
  nightlyPoints,
  recentFrom,
  tailReadFrom,
} from "./value-history";

describe("needsHistoryRebuild", () => {
  const acquired = (d: string | null) => ({ owned: true, acquiredAt: d });

  // Since 2026-09-13 a built history is every day from 2024-02-08, weekdays included: a weekday
  // is no longer the mark of the old series, and a nightly rebuild would not fit in the cron.
  it("leaves a built account alone, whatever days its history has", () => {
    expect(
      needsHistoryRebuild(
        ["2024-02-08", "2024-02-09", "2026-08-17", "2026-08-18"],
        [acquired("2023-09-01T00:00:00Z")],
      ),
    ).toBe(false);
    expect(
      needsHistoryRebuild(["2024-12-30", "2026-08-16"], [acquired("2023-09-01T00:00:00Z")]),
    ).toBe(false);
  });

  it("rebuilds an account with copies from before the nightly series and no history there yet", () => {
    expect(needsHistoryRebuild(["2026-09-09"], [acquired("2025-01-01T00:00:00Z")])).toBe(true);
    expect(needsHistoryRebuild([], [acquired(null)])).toBe(true);
  });

  it("does nothing for an account that started after the nightly series did", () => {
    expect(needsHistoryRebuild(["2026-09-09"], [acquired("2026-09-09T12:00:00Z")])).toBe(false);
    expect(HISTORY_DAILY_FROM).toBe("2026-08-16");
  });
});

describe("nightlyPoints", () => {
  const item = (over: Partial<CardItem>): CardItem =>
    ({
      id: "row",
      tcgId: "base1-25",
      catalogue: "en",
      owned: true,
      finish: null,
      edition: null,
      quantity: 1,
      acquiredAt: null,
      ...over,
    }) as CardItem;
  const day = (n: number) => new Date(Date.UTC(2026, 7, 1 + n)).toISOString().slice(0, 10);
  // Pikachu read every night, Charizard only on Saturdays (2026-08-01 is one): the two kinds of card
  // the price history holds.
  const pikachu = item({ id: "pika", tcgId: "base1-58" });
  const charizard = item({ id: "zard", tcgId: "base1-4", quantity: 2 });
  const readings: CardPricePoint[] = [];
  for (let n = 0; n < 60; n++) {
    readings.push({ language: "en", tcgId: "base1-58", date: day(n), market: 10 + n, holo: null });
    if (n % 7 === 0)
      readings.push({
        language: "en",
        tcgId: "base1-4",
        date: day(n),
        market: 400 + n,
        holo: null,
      });
  }
  const tonight = day(59);

  // A dip is held once it has come back, up to DIP_DAYS after it began: the nights it covered are
  // written again with the level, or they stood in the table for good.
  it("writes the nights a dip can still be held over, as the whole history draws those days", () => {
    // Read on day 23 and not again until tonight: its day 23 figure still prices day 37, the first
    // night written, CARRY_DAYS later.
    const sparse = item({ id: "gym", tcgId: "gym1-2" });
    const all = [
      ...readings,
      { language: "en" as const, tcgId: "gym1-2", date: day(23), market: 70, holo: null },
      { language: "en" as const, tcgId: "gym1-2", date: day(58), market: 72, holo: null },
    ];
    const window = all.filter((r) => r.date >= nightReadFrom(tonight));
    const points = nightlyPoints([pikachu, charizard, sparse], window, tonight);
    expect(points.map((p) => p.date)).toEqual(
      Array.from({ length: DIP_DAYS + 1 }, (_, i) => day(59 - DIP_DAYS - 1 + i)),
    );
    expect(59 - 37).toBe(DIP_DAYS + 1);
    expect(37 - 23).toBe(CARRY_DAYS);
    const whole = holdingsSeries([pikachu, charizard, sparse], all).filter((p) =>
      points.some((q) => q.date === p.date),
    );
    expect(points).toEqual(whole);
  });

  it("writes nothing for tonight itself, whose readings the price job has not written yet", () => {
    expect(nightlyPoints([pikachu], readings, tonight).some((p) => p.date >= tonight)).toBe(false);
  });
});

/**
 * Which days the line still has to be worked out for.
 *
 * Home summed every reading of every held card over ninety days on every visit and drew the result
 * over stored points that said the same figures: 144,574 readings, 1,678 ms to read and 241 ms to
 * add up (production, 2026-09-17). The table answers every night the cron wrote; this is what is
 * left.
 */
describe("recentFrom", () => {
  const through = (last: string, days: number) =>
    Array.from({ length: days }, (_, i) =>
      new Date(Date.parse(`${last}T00:00:00Z`) - (days - 1 - i) * 86_400_000)
        .toISOString()
        .slice(0, 10),
    );

  it("leaves today alone to be worked out, where the cron kept up", () => {
    expect(recentFrom(through("2026-09-17", 95), "2026-09-18")).toBe("2026-09-18");
  });

  it("starts at the earliest night the cron missed, so a gap is drawn and not stepped over", () => {
    const stored = through("2026-09-17", 95).filter((d) => d !== "2026-09-10");
    expect(recentFrom(stored, "2026-09-18")).toBe("2026-09-10");
  });

  it("works out the whole window for an account with no points at all", () => {
    expect(recentFrom([], "2026-09-18")).toBe("2026-06-20");
  });

  it("works out the whole window for a history that stopped months ago", () => {
    expect(recentFrom(through("2026-01-10", 30), "2026-09-18")).toBe("2026-06-20");
  });

  it("holds the window it falls back to at the readings' ninety days", () => {
    expect(HISTORY_WINDOW_DAYS).toBe(90);
  });
});

describe("tailReadFrom", () => {
  // A card with no reading on the day is priced at its last one, up to CARRY_DAYS old
  // (holdingsSeries): the tail has to read that fortnight or it prices the collection from
  // whatever happened to have a reading that morning.
  it("reads one day further back than a reading can stand", () => {
    expect(tailReadFrom("2026-09-18")).toBe("2026-09-03");
  });
});
