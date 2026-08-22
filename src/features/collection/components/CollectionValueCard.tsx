"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartActiveDot, ChartTooltipContent } from "@/components/application/charts/charts-base";
import Card from "@/components/shared/Card";
import { LOCALE } from "@/lib/core/config";
import { euroWhole } from "@/lib/core/format";
import { chartPoints, niceScale, timeTicks } from "@/lib/core/value-chart";
import type { ValueSnapshot } from "@/lib/core/value-snapshot";

/**
 * What your collection has been worth, as a line, on the dashboard.
 *
 * It sits under the four headline numbers because it is the one of them that has
 * a history: "Collection value €39,887" is the last reading of this chart, and
 * the chart is the only thing on the page that says whether that number is
 * remarkable. So no figure of its own and no link out. The tile above says what
 * the binder is worth now, this says how it got there, and the reader is already
 * on their own dashboard.
 *
 * The series is recorded rather than fetched, because no free feed publishes the
 * history: app/api/v1/cron/snapshot argues that at length and is the thing that
 * adds a point, nightly.
 *
 * It is handed the readings rather than importing them. It used to import
 * lib/core/collection-value.generated.json, one committed file generated for one
 * account, which every account on the deployment then read as its own — see
 * lib/core/value-history.ts for what that looked like and why it is a table now.
 * The page above resolves whose these are; this file draws whatever it is given
 * and nothing else.
 *
 * Nothing assumes how many points there are. Fewer than two and it renders
 * nothing at all, which is the right answer for an account that has never been
 * snapshotted: one reading is a fact about today, not a history, and there is
 * no empty state worth writing for a chart.
 *
 * It is Untitled UI's chart: two real axes, horizontal gridlines,
 * the brand colour, and a dot only where the pointer is. It had hidden axes and
 * a filled dot on every reading, which is neither theirs nor readable.
 */

/**
 * Two date formats, because the axis and the tooltip answer different questions.
 *
 * The axis is a scale — a handful of labels across two years, so month and
 * year; a label per daily reading would be a grey smear. The tooltip is a
 * single reading, and the readings are daily now, so "December 2024" would name
 * four of them identically and the day has to be in it.
 *
 * Both go through toLocaleDateString rather than lib/format's formatDate, which
 * only accepts a bare YYYY-MM-DD and only ever writes English. These labels are
 * chrome the reader is meant to skim, so they follow LOCALE like the euro
 * figures beside them.
 */
const axisMonth = (t: number) =>
  new Date(t).toLocaleDateString(LOCALE, { month: "short", year: "numeric" });

const fullDate = (t: number) =>
  new Date(t).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" });

/**
 * Untitled UI's Y axis is a handful of round numbers, not one label per
 * thousand. Four gaps is what fits 240px without the labels touching.
 */
const TICKS_Y = 5;
/** Six across the width: their own charts' density, and what reads at 320px. */
const TICKS_X = 6;

/** €39,887 → "€40k". A full figure per tick is a wall of digits at 12px. */
const compactEuro = (n: number) =>
  Math.abs(n) >= 1000 ? `€${Math.round(n / 100) / 10}k` : euroWhole(n);

export default function CollectionValueCard({ snapshots }: { snapshots: ValueSnapshot[] }) {
  // The arithmetic lives in lib/core/value-chart.ts so it can be tested; null is
  // "fewer than two readings", which is an account with no history yet.
  const points = chartPoints(snapshots);
  if (!points) return null;

  const first = snapshots[0]!;
  const last = snapshots.at(-1)!;
  const grew = last.value - first.value;

  const values = points.map((p) => p.value);
  const scale = niceScale(Math.min(...values), Math.max(...values), TICKS_Y);

  return (
    <Card className="flex flex-col gap-2">
      <h2 className="m-0 font-body font-medium text-display-xs text-primary">Value over time</h2>
      {/* The caption carries the change rather than the total, because the total
          is already the fourth tile above and repeating it here would be the
          page saying one thing twice in two sizes. "Since December 2024" is the
          honest frame: it is where the record starts, not where the collecting
          did. */}
      <p className="[margin:0_0_calc(var(--spacing)*3)_0] max-w-[60ch] font-body text-xs text-tertiary">
        {grew >= 0 ? "Up" : "Down"} {euroWhole(Math.abs(grew))} since {fullDate(points[0]!.t)},
        across {last.cards.toLocaleString(LOCALE)} cards.
      </p>

      {/* Recharts, drawn the way Untitled UI draw theirs. The axis labels are
          styled with a class on the chart rather than `fill` props on each
          axis, so they inherit the theme like every other piece of type in the
          app — which is the whole reason the two end dates used to sit outside
          the chart as plain <p> text. They are inside it now, as an axis,
          because a reader wanting the value in March cannot get it off two
          labels at the ends.

          The <ul> below stays. A chart is still not readable by a screen
          reader, and the figures written out are what makes this accessible —
          the tooltip is for a pointer, not a replacement for the list. */}
      {/* `fill-current` is load-bearing, not tidiness. Recharts writes
          fill="#666" onto every tick as a presentation attribute, which is the
          same grey in both themes: 5.7:1 on the white card, but 3.0:1 on the
          near-black one, under the 4.5:1 that 12px text needs. A CSS
          declaration beats a presentation attribute, so this hands the ticks
          back to `text-tertiary` and to the theme. */}
      <div className="mt-5 h-60 w-full text-tertiary [&_.recharts-cartesian-axis-tick-value]:fill-current [&_.recharts-cartesian-axis-tick-value]:font-body [&_.recharts-cartesian-axis-tick-value]:text-xs">
        <ResponsiveContainer width="100%" height="100%">
          {/* Room on the right for the hover dot, which is 12px across and
              would otherwise be half outside the box on the last reading — the
              one a reader is most likely to point at. */}
          <AreaChart data={points} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="value-over-time" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-utility-brand-600)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--color-utility-brand-600)" stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* Horizontal only. Verticals on a time axis whose points are a day
                apart at one end and eighteen months apart at the other would
                claim a regularity the series does not have. */}
            <CartesianGrid vertical={false} stroke="var(--color-border-secondary)" />

            {/* A time axis, not a category one. `dataKey="date"` with no type
                is what this was, and Recharts spaces categories evenly: the
                gap between December 2024 and June 2026 drew the same width as
                a week.

                Where the labels go is timeTicks' problem, and it is the same
                problem again one level up: Recharts' own tickCount draws the
                two ends and nothing between, and charts-base's
                selectEvenlySpacedItems picks evenly by position in the list.
                Both are written up there. */}
            <XAxis
              type="number"
              dataKey="t"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={timeTicks(points[0]!.t, points.at(-1)!.t, TICKS_X)}
              tickFormatter={axisMonth}
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              minTickGap={16}
            />

            {/* Rounded outwards to 30k/35k/40k/45k rather than sitting exactly
                on the lowest and highest readings — see niceScale. */}
            <YAxis
              dataKey="value"
              domain={scale.domain}
              ticks={scale.ticks}
              tickFormatter={compactEuro}
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              width={52}
            />

            <Tooltip
              content={<ChartTooltipContent labelFormatter={(v) => fullDate(Number(v))} />}
              formatter={(v) => euroWhole(Number(v))}
              cursor={{ stroke: "var(--color-utility-brand-600)", strokeWidth: 2 }}
            />

            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-utility-brand-600)"
              strokeWidth={2}
              fill="url(#value-over-time)"
              activeDot={<ChartActiveDot />}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <ul className="sr-only">
        {points.map((p) => (
          <li key={p.date}>
            {fullDate(p.t)}: {euroWhole(p.value)}, {p.priced.toLocaleString(LOCALE)} cards priced
          </li>
        ))}
      </ul>
    </Card>
  );
}
