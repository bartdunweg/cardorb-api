/**
 * The value chart's geometry, with no markup in it.
 *
 * Pulled out of app/components/CollectionValueCard.tsx so the two decisions in
 * here can be tested. There is no component testing in this repo — no jsdom, no
 * RTL — and both of these are arithmetic that looks fine in a screenshot while
 * being wrong: a line spaced by array index draws a year and a half of silence
 * the same width as a week, and "too few readings to be a history" is the whole
 * of what a brand-new account sees on the dashboard.
 */

import type { ValueSnapshot } from "./value-snapshot";

export type ChartPoint = ValueSnapshot & { x: number; y: number };

export type Chart = {
  points: ChartPoint[];
  /** The line itself, as an SVG path. */
  line: string;
  /** The same line closed against the baseline, for the fill under it. */
  under: string;
};

export type ChartBox = { w: number; h: number; pad: number };

/**
 * A chart, or null where there is not enough to draw one.
 *
 * A line needs two points and a change needs two dates. One reading is a fact
 * about today, not a history, so the card says nothing rather than drawing a
 * dot and calling it a trend — which is exactly what a new account should see,
 * and is why this returns null rather than an empty chart.
 */
export function chartPoints(snapshots: ValueSnapshot[], box: ChartBox): Chart | null {
  const first = snapshots[0];
  const last = snapshots.at(-1);
  if (!first || !last || snapshots.length < 2) return null;

  const { w, h, pad } = box;

  /**
   * X is time, not position in the array.
   *
   * The points are nowhere near evenly spaced: the archive gave up December
   * 2024 and June 2026 and nothing between them, and from here on they arrive
   * weekly. Spacing them evenly would draw a year and a half of silence the
   * same width as a week and make the collection look like it grew in steady
   * steps. The gap is part of what the chart knows.
   */
  const t = (iso: string) => new Date(iso).getTime();
  const span = t(last.date) - t(first.date) || 1;

  /**
   * Zero at the bottom, because this is a value rather than a deviation, and a
   * line that starts at the lowest reading turns any wobble into a cliff.
   *
   * `|| 1` guards a collection whose every reading is zero — a wishlist-only
   * account, snapshotted twice — which would otherwise divide by zero and draw
   * a line made of NaN.
   */
  const top = Math.max(...snapshots.map((s) => s.value)) || 1;

  const points: ChartPoint[] = snapshots.map((s) => ({
    ...s,
    x: pad + ((t(s.date) - t(first.date)) / span) * (w - pad * 2),
    y: pad + (1 - s.value / top) * (h - pad * 2),
  }));

  const line = points
    .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const under = `${line} L${points.at(-1)!.x.toFixed(1)} ${h} L${points[0]!.x.toFixed(1)} ${h} Z`;

  return { points, line, under };
}
