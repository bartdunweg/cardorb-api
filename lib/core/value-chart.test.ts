import { describe, expect, it } from "vitest";
import { chartPoints } from "./value-chart";
import type { ValueSnapshot } from "./value-snapshot";

const at = (date: string, value: number): ValueSnapshot => ({
  date,
  value,
  cards: 1,
  priced: 1,
  unpriced: 0,
});

const BOX = { w: 640, h: 150, pad: 8 };

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
    expect(chartPoints([], BOX)).toBeNull();
  });

  it("refuses to draw a history out of one reading", () => {
    expect(chartPoints([at("2026-08-06", 39_887)], BOX)).toBeNull();
  });

  it("spaces points by elapsed time, not by position in the list", () => {
    // The real series: a year and a half of silence, then seven weeks. Spaced
    // evenly, the gap and the week would draw the same width and the collection
    // would look like it grew in steady steps.
    const chart = chartPoints(
      [at("2024-12-30", 15_634), at("2026-06-17", 38_000), at("2026-08-06", 39_887)],
      BOX,
    )!;
    const [a, b, c] = chart.points;
    expect(c!.x - b!.x).toBeLessThan(b!.x - a!.x);
    // Ends flush against the padding on both sides.
    expect(a!.x).toBeCloseTo(BOX.pad);
    expect(c!.x).toBeCloseTo(BOX.w - BOX.pad);
  });

  it("measures height from zero, so a small rise is not drawn as a cliff", () => {
    const chart = chartPoints([at("2026-01-01", 900), at("2026-02-01", 1_000)], BOX)!;
    const [low, high] = chart.points;
    // The tallest reading sits at the top of the box, and the other one is
    // nine tenths of the way up rather than at the floor.
    expect(high!.y).toBeCloseTo(BOX.pad);
    expect(low!.y).toBeCloseTo(BOX.pad + 0.1 * (BOX.h - BOX.pad * 2));
  });

  it("survives a collection that has only ever been worth nothing", () => {
    // A wishlist-only account, snapshotted twice. Dividing by the highest
    // reading would be dividing by zero and drawing a line made of NaN.
    const chart = chartPoints([at("2026-01-01", 0), at("2026-02-01", 0)], BOX)!;
    expect(chart.line).not.toContain("NaN");
    expect(chart.under).not.toContain("NaN");
  });

  it("closes the fill against the baseline, not against the line", () => {
    const chart = chartPoints([at("2026-01-01", 10), at("2026-02-01", 20)], BOX)!;
    expect(chart.under.startsWith(chart.line)).toBe(true);
    expect(chart.under.endsWith("Z")).toBe(true);
    expect(chart.under).toContain(`${BOX.h}`);
  });
});
