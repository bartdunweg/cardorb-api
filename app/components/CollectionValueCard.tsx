import Card from "./Card";
import { LOCALE } from "../../lib/core/config";
import { euroWhole } from "../../lib/core/format";
import { chartPoints } from "../../lib/core/value-chart";
import type { ValueSnapshot } from "../../lib/core/value-snapshot";

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

  const { points, line, under } = chart;
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
      <p className="[margin:0_0_var(--space-3)_0] max-w-[60ch] font-body text-xs text-tertiary">
        {grew >= 0 ? "Up" : "Down"} {euroWhole(Math.abs(grew))} since {monthYear(first.date)},
        across {last.cards.toLocaleString(LOCALE)} cards.
      </p>

      <div className="mt-5">
        {/* aria-hidden with the same figures written out below it, rather than a
            role="img" and a label trying to say a line in one sentence. A chart
            read aloud as "line chart trending up" is not the data; the list is.
            The same call the two bar charts on this page make. */}
        <svg
          className="block w-full h-auto overflow-visible"
          viewBox={`0 0 ${W} ${H}`}
          aria-hidden="true"
          focusable="false"
        >
          <path className="fill-[var(--color-surface-subtle)] stroke-none" d={under} />
          {/* non-scaling-stroke so the line keeps its weight at whatever width
              the card ends up: the viewBox is 640 wide and the card is rarely
              that, so without it the stroke is scaled down with everything else
              and draws thin. */}
          <path
            className="fill-none stroke-[var(--color-label)] stroke-2 [stroke-linecap:round] [stroke-linejoin:round]"
            d={line}
            vectorEffect="non-scaling-stroke"
          />
          {/* One mark per reading, and they are not decoration. Three points
              spread over twenty months drawn as a smooth line reads as a
              continuous record; the dots are what says there are three
              measurements here and the rest is the shortest path between them.
              They will matter less as the weekly points fill in. */}
          {points.map((p) => (
            <circle
              key={p.date}
              className="fill-[var(--color-bg-surface)] stroke-[var(--color-label)] stroke-2"
              cx={p.x}
              cy={p.y}
              r={5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {/* Outside the SVG rather than as <text>, so the labels are real type at
            the page's own size and inherit the theme like everything else,
            instead of being scaled with the drawing. */}
        <p
          className="flex justify-between mt-2 mb-0 font-body
            text-xs text-tertiary"
        >
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
