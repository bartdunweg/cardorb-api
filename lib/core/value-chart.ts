/**
 * The value chart's arithmetic, with no markup in it.
 *
 * Pulled out of components/custom/CollectionValueCard.tsx so the decisions in
 * here can be tested. There is no component testing in this repo — no jsdom, no
 * RTL — and both of these are arithmetic that looks fine in a screenshot while
 * being wrong: "too few readings to be a history" is the whole of what a
 * brand-new account sees on the dashboard, and an axis whose ticks land on
 * 38,412 instead of 40,000 is a chart nobody can read a value off.
 *
 * It used to draw the line too — an SVG path per point, plus the same path
 * closed against the baseline for the fill. Recharts draws both now, and the
 * paths had gone unread since; see ADR-0085 for what was left behind and why
 * it is gone.
 */

import type { ValueSnapshot } from "./value-snapshot";

/** A reading, plus the epoch-ms the time axis is scaled by. */
export type ChartPoint = ValueSnapshot & { t: number };

/**
 * The readings the chart draws, or null where there are not enough to draw one.
 *
 * A line needs two points and a change needs two dates. One reading is a fact
 * about today, not a history, so the card says nothing rather than drawing a
 * dot and calling it a trend — which is exactly what a new account should see,
 * and is why this returns null rather than an empty list.
 *
 * `t` is here rather than in the component because it is what makes the X axis
 * a *time* axis. The points are nowhere near evenly spaced: the archive gave up
 * December 2024 and June 2026 and nothing between them, and from here on they
 * arrive daily. Handed the ISO date as a plain category, Recharts spaces them
 * by position in the list, which draws a year and a half of silence the same
 * width as a day and makes the collection look like it grew in steady steps.
 * The gap is part of what the chart knows.
 */
export function chartPoints(snapshots: ValueSnapshot[]): ChartPoint[] | null {
  if (snapshots.length < 2) return null;
  return snapshots.map((s) => ({ ...s, t: new Date(s.date).getTime() }));
}

/**
 * Where to put the labels on the time axis, spaced by time.
 *
 * Neither of the obvious answers works here. Recharts' own `tickCount` on a
 * time axis whose domain is pinned to the data draws the two endpoints and
 * nothing between them. And charts-base's `selectEvenlySpacedItems` picks
 * evenly by *position in the list*, which is the same mistake the axis itself
 * used to make: with five of six readings inside one fortnight it returns five
 * labels for that fortnight and one for the year and a half before it.
 *
 * So: cut the elapsed span into equal parts. The two ends stay exactly on the
 * first and last reading, because those are the dates the caption names and an
 * axis that stops short of its own line looks broken. The ones between are
 * pulled back to the first of their month, so the labels read "mrt 2025" at the
 * place March actually is rather than at a date that happens to be 40% along.
 *
 * @param count how many labels are wanted; fewer come back if months collide
 */
export function timeTicks(from: number, to: number, count = 6): number[] {
  if (!(to > from)) return [from];
  const n = Math.max(count - 1, 1);
  const monthStart = (t: number) => {
    const d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  };

  const ticks = new Set<number>([from]);
  for (let i = 1; i < n; i++) {
    const snapped = monthStart(from + ((to - from) * i) / n);
    // A snapped tick can land before the first reading (30 December → 1
    // December). Recharts silently drops anything outside the domain, so it
    // would be a missing label rather than a wrong one — dropped here instead,
    // where it is visible.
    if (snapped > from && snapped < to) ticks.add(snapped);
  }
  ticks.add(to);

  return [...ticks].sort((a, b) => a - b);
}

export type Scale = { domain: [number, number]; ticks: number[] };

/**
 * An axis a person can read a number off, rather than one that ends on 38,412.
 *
 * Recharts' own `domain={["dataMin", "dataMax"]}` puts the lowest reading
 * exactly on the floor and the highest exactly on the ceiling, so the axis is
 * labelled with whatever the data happened to be and every wobble is drawn as a
 * cliff. This rounds outwards to a step from the 1 / 2 / 2.5 / 5 × 10ⁿ family —
 * the steps people already read money in — so the labels come out 30k, 35k,
 * 40k, 45k.
 *
 * It rounds *around* the data rather than starting at zero, on purpose. A
 * collection worth €39,887 that moved €1,500 this quarter is a chart of the
 * €1,500: anchored at zero the movement is a flat line four fifths of the way
 * up the card, which is a true picture of nothing anybody asked.
 *
 * @param min the lowest reading
 * @param max the highest reading
 * @param count roughly how many ticks are wanted; the step decides the rest
 */
export function niceScale(min: number, max: number, count = 5): Scale {
  // A flat series — every reading identical, or a wishlist-only account
  // snapshotted twice — has no span to divide by. Invent one a tenth of the
  // value wide, so €39,887 twice gets a €39k–€40k frame rather than a division
  // by zero, and a collection that has only ever been worth nothing falls
  // through to a plain unit scale.
  const span = max - min || Math.abs(max) * 0.1 || Math.max(count - 1, 1);
  const rough = span / Math.max(count - 1, 1);

  // Round the step itself up to the next "nice" number, so 1,730 becomes 2,000
  // rather than the axis being labelled in seventeen-hundreds.
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((m) => rough <= m * magnitude) ?? 10) * magnitude;

  const lo = Math.floor(min / step) * step;
  // Rounding a value that already sits exactly on a step leaves the floor and
  // the ceiling on the same number — an axis with one label and no height.
  // €40,000 twice, or €0 twice, are the ways to reach it.
  const ceiling = Math.ceil(max / step) * step;
  const hi = ceiling > lo ? ceiling : lo + step;

  const ticks: number[] = [];
  // Multiply rather than accumulate: adding 2.5 to itself forty times drifts
  // into floating point noise and puts 37499.999999 on the axis.
  for (let i = 0; lo + i * step <= hi + step / 1000; i++) ticks.push(lo + i * step);

  return { domain: [lo, hi], ticks };
}
