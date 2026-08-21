"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ChartActiveDot,
  ChartTooltipContent,
} from "@/components/application/charts/charts-base";
import Card from "@/components/custom/Card";
import { LOCALE } from "@/lib/core/config";
import { euroWhole } from "@/lib/core/format";
import { chartPoints } from "@/lib/core/value-chart";
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
 * history: scripts/snapshot-collection-value.mjs argues that at length and is the
 * thing that adds a point.
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
 */

/**
 * Whole euros, from lib/format, rather than another copy of the same function.
 *
 * formatDate is not used for the dates below: it writes "Dec 30, 2024", and a
 * day is a precision this series does not have. A snapshot is whatever
 * Cardmarket published that morning, so the month is the honest unit.
 */
const monthYear = (iso: string) =>
  new Date(iso).toLocaleDateString(LOCALE, { month: "long", year: "numeric" });

const shortMonth = (iso: string) =>
  new Date(iso).toLocaleDateString(LOCALE, { month: "short", year: "numeric" });

/**
 * The drawing's own coordinate space, and the ratio is the decision here.
 *
 * The SVG scales uniformly to the card's width, so this ratio is the chart's
 * height. At 200 it drew 339px tall in the dashboard column, which is taller
 * than the ten-row table under it for three readings, and the fill became a
 * grey slab rather than a line with ground under it. Roughly four to one reads
 * as a chart of a trend, which is what this is.
 */
const W = 640;
const H = 150;
/** Room on every side so a dot on the edge is not half outside the viewBox. */
const PAD = 8;

export default function CollectionValueCard({ snapshots }: { snapshots: ValueSnapshot[] }) {
  // The geometry lives in lib/core/value-chart.ts so it can be tested; null is
  // "fewer than two readings", which is an account with no history yet.
  const chart = chartPoints(snapshots, { w: W, h: H, pad: PAD });
  if (!chart) return null;

  // `line` and `under` were the two SVG paths; Recharts draws both now.
  const { points } = chart;
  const first = snapshots[0]!;
  const last = snapshots.at(-1)!;
  const grew = last.value - first.value;

  return (
    <Card className="flex flex-col gap-2">
      <h2 className="m-0 font-body font-medium text-display-xs text-primary">
        Value over time
      </h2>
      {/* The caption carries the change rather than the total, because the total
          is already the fourth tile above and repeating it here would be the
          page saying one thing twice in two sizes. "Since December 2024" is the
          honest frame: it is where the record starts, not where the collecting
          did. */}
      <p className="[margin:0_0_calc(var(--spacing)*3)_0] max-w-[60ch] font-body text-xs text-tertiary">
        {grew >= 0 ? "Up" : "Down"} {euroWhole(Math.abs(grew))} since {monthYear(first.date)},
        across {last.cards.toLocaleString(LOCALE)} cards.
      </p>

      {/* Recharts, with Untitled UI's tooltip on it (charts-base). It was a
          hand-drawn <svg> and 75 lines of geometry in lib/core/value-chart.ts
          working out where each point lands; ResponsiveContainer does that now,
          and the reader gains a tooltip the drawing never had.

          The <ul> below stays. A chart is still not readable by a screen
          reader, and the figures written out are what makes this accessible —
          the tooltip is for a pointer, not a replacement for the list. */}
      <div className="mt-5 h-[150px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="value-over-time" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-bg-secondary)" stopOpacity={1} />
                <stop offset="100%" stopColor="var(--color-bg-secondary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide />
            <YAxis dataKey="value" domain={["dataMin", "dataMax"]} hide />
            <Tooltip
              content={<ChartTooltipContent labelFormatter={(v) => monthYear(String(v))} />}
              formatter={(v) => euroWhole(Number(v))}
              cursor={{ stroke: "var(--color-border-secondary)" }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-text-primary)"
              strokeWidth={2}
              fill="url(#value-over-time)"
              activeDot={<ChartActiveDot />}
              dot={{ r: 4, fill: "var(--color-text-primary)", strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
        {/* Outside the chart rather than an axis, so the labels are real type at
            the page's own size and inherit the theme like everything else. */}
        <p className="flex justify-between mt-2 mb-0 font-body text-xs text-tertiary">
          <span>{shortMonth(first.date)}</span>
          <span>{shortMonth(last.date)}</span>
        </p>
      </div>

      <ul className="sr-only">
        {points.map((p) => (
          <li key={p.date}>
            {monthYear(p.date)}: {euroWhole(p.value)}, {p.priced.toLocaleString(LOCALE)} cards
            priced
          </li>
        ))}
      </ul>
    </Card>
  );
}
