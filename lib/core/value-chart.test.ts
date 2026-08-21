import { describe, expect, it } from "vitest";
import { chartPoints, niceScale, timeTicks } from "./value-chart";
import type { ValueSnapshot } from "./value-snapshot";

const at = (date: string, value: number): ValueSnapshot => ({
  date,
  value,
  cards: 1,
  priced: 1,
  unpriced: 0,
});

describe("chartPoints", () => {
  /**
   * The whole of "a new account sees no chart".
   *
   * This is the bug the per-user snapshots table was built to close: the card
   * used to import one committed file, so every account drew the seed owner's
   * three points under its own value tile. Now an account with no history is
   * handed an empty list, and this is what turns that into nothing rendered
   * rather than a dot presented as a trend.
   */
  it("refuses to draw a history out of nothing", () => {
    expect(chartPoints([])).toBeNull();
  });

  it("refuses to draw a history out of one reading", () => {
    expect(chartPoints([at("2026-08-06", 39_887)])).toBeNull();
  });

  /**
   * The real series: a year and a half of silence, then seven weeks. This is
   * what the X axis is scaled by, and handing Recharts the ISO date instead
   * spaces the gap and the week identically — which is what it did, silently,
   * for as long as the chart had a hidden axis nobody could check it against.
   */
  it("carries a timestamp, so the gaps in the series keep their width", () => {
    const points = chartPoints([
      at("2024-12-30", 15_634),
      at("2026-06-17", 38_000),
      at("2026-08-06", 39_887),
    ])!;
    const [a, b, c] = points;
    expect(c!.t - b!.t).toBeLessThan(b!.t - a!.t);
    expect(a!.t).toBe(Date.parse("2024-12-30"));
  });

  it("keeps every field of the reading it was given", () => {
    const points = chartPoints([at("2026-01-01", 10), at("2026-02-01", 20)])!;
    expect(points[0]).toMatchObject({ date: "2026-01-01", value: 10, priced: 1, unpriced: 0 });
  });
});

describe("niceScale", () => {
  it("labels the axis in numbers a person reads money in", () => {
    const { domain, ticks } = niceScale(31_204, 44_310);
    expect(domain).toEqual([30_000, 45_000]);
    expect(ticks).toEqual([30_000, 35_000, 40_000, 45_000]);
  });

  it("rounds outwards, so no reading falls outside the axis", () => {
    const { domain } = niceScale(15_634, 39_887);
    expect(domain[0]).toBeLessThanOrEqual(15_634);
    expect(domain[1]).toBeGreaterThanOrEqual(39_887);
  });

  it("frames the data rather than starting at zero", () => {
    // €39,887 that moved €1,500 is a chart of the €1,500. Anchored at zero it
    // is a flat line four fifths up the card.
    const { domain } = niceScale(38_400, 39_887);
    expect(domain[0]).toBeGreaterThan(30_000);
  });

  it("survives a collection that has only ever been worth nothing", () => {
    // A wishlist-only account, snapshotted twice. No span to divide by.
    const { domain, ticks } = niceScale(0, 0);
    expect(domain.every(Number.isFinite)).toBe(true);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.every(Number.isFinite)).toBe(true);
  });

  it("survives a series that never moved", () => {
    const { domain, ticks } = niceScale(39_887, 39_887);
    expect(domain[0]).toBeLessThanOrEqual(39_887);
    expect(domain[1]).toBeGreaterThanOrEqual(39_887);
    expect(ticks.every(Number.isFinite)).toBe(true);
  });

  it("gives the axis height even when the flat value is already a round one", () => {
    // €40,000 twice: floor and ceil of a number that sits exactly on the step
    // both land on it, so the axis would have one label and no height.
    for (const flat of [0, 1, 40_000, 100]) {
      const { domain } = niceScale(flat, flat);
      expect(domain[1]).toBeGreaterThan(domain[0]);
    }
  });

  it("puts whole numbers on the axis, not floating point noise", () => {
    // 2.5 accumulated is where this goes wrong: 37499.999999996 on an axis.
    const { ticks } = niceScale(0, 9);
    for (const tick of ticks) expect(tick).toBeCloseTo(Math.round(tick * 100) / 100, 10);
  });

  it("ends on the top tick, so the axis has no empty rail above it", () => {
    const { domain, ticks } = niceScale(31_204, 44_310);
    expect(ticks.at(-1)).toBe(domain[1]);
    expect(ticks[0]).toBe(domain[0]);
  });
});

describe("timeTicks", () => {
  const t = (iso: string) => Date.parse(iso);

  /**
   * The regression this exists for. The real series is one reading in December
   * 2024, one in June 2026, then one a day: picking labels evenly from the list
   * puts five of six on the last fortnight, and Recharts' own tickCount draws
   * the two ends and nothing between.
   */
  it("spreads the labels across the elapsed time, not across the list", () => {
    const ticks = timeTicks(t("2024-12-30"), t("2026-08-21"), 6);
    expect(ticks.length).toBeGreaterThanOrEqual(5);
    const gaps = ticks.slice(1).map((tick, i) => tick - ticks[i]!);
    const spread = Math.max(...gaps) / Math.min(...gaps);
    // Roughly even. Snapping to month starts moves them a little; it does not
    // move them by a factor of ten.
    expect(spread).toBeLessThan(2);
  });

  it("starts and ends on the readings the caption names", () => {
    const from = t("2024-12-30");
    const to = t("2026-08-21");
    const ticks = timeTicks(from, to, 6);
    expect(ticks[0]).toBe(from);
    expect(ticks.at(-1)).toBe(to);
  });

  it("keeps every label inside the axis, so none is silently dropped", () => {
    const from = t("2024-12-30");
    const to = t("2026-08-21");
    for (const tick of timeTicks(from, to, 6)) {
      expect(tick).toBeGreaterThanOrEqual(from);
      expect(tick).toBeLessThanOrEqual(to);
    }
  });

  it("pulls the middle labels back to the first of their month", () => {
    const ticks = timeTicks(t("2024-12-30"), t("2026-08-21"), 6);
    for (const tick of ticks.slice(1, -1)) {
      expect(new Date(tick).getUTCDate()).toBe(1);
    }
  });

  it("returns something drawable for two readings a day apart", () => {
    const ticks = timeTicks(t("2026-08-20"), t("2026-08-21"), 6);
    expect(ticks).toEqual([t("2026-08-20"), t("2026-08-21")]);
  });

  it("does not loop or duplicate when both readings are the same day", () => {
    const ticks = timeTicks(t("2026-08-21"), t("2026-08-21"), 6);
    expect(ticks).toEqual([t("2026-08-21")]);
  });
});
