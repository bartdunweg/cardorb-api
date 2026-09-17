import { describe, expect, it } from "vitest";
import { holdingsSeries } from "./folder-history";
import type { CardItem } from "./items";
import type { CardPricePoint } from "./movers";
import {
  HISTORY_DAILY_FROM,
  needsHistoryRebuild,
  nightReadFrom,
  nightlyPoints,
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

  it("writes the last week before tonight, as the whole history draws those days", () => {
    const window = readings.filter((r) => r.date >= nightReadFrom(tonight));
    const points = nightlyPoints([pikachu, charizard], window, tonight);
    expect(points.map((p) => p.date)).toEqual([52, 53, 54, 55, 56, 57, 58].map(day));
    const whole = holdingsSeries([pikachu, charizard], readings).filter((p) =>
      points.some((q) => q.date === p.date),
    );
    expect(points).toEqual(whole);
  });

  it("writes nothing for tonight itself, whose readings the price job has not written yet", () => {
    expect(nightlyPoints([pikachu], readings, tonight).some((p) => p.date >= tonight)).toBe(false);
  });
});
