---
id: FB-0021
date: 2026-08-22
source: Bart
source-type: stakeholder
severity: 3
sentiment: negative
status: addressed
tags: [interface, charts, dashboard, untitled-ui, data]
---

# The value chart is ugly, has no axes, and has almost nothing in it

## What was said

Three messages, in order, all about the same card.

> "Kunnen we die value over time-grafiek meer zoals de standaard "Untitled"-grafiek
> weergeven?
>
> Ik vind hem heel lelijk en ik wil kijken of we hem meer kunnen maken zoals de
> standaardgrafiek van "Untitled". Misschien gooi je, ja. Er hoeven geen cirkels
> op de lijn te zitten."

English: "Can we show that value-over-time chart more like the standard 'Untitled'
chart? I find it really ugly and I want to see whether we can make it more like
Untitled's standard chart. Maybe you throw, yes. There don't need to be circles
on the line."

> "Er moeten trouwens wel assen op een I-as en een X-as zijn op die grafiek."

English: "There do need to be axes though — a Y axis and an X axis on that chart."
(Written as "I-as"; dictated, and the intended word is the Y axis.)

> "er zijn nu maar 4 meetpuntjes, maar kunnen we een meetpunt doen vaker"

English: "there are only 4 measurement points now, but can we take a measurement
more often."

## Context

Said unprompted, from looking at `/dashboard`, not from reviewing a change.

All three complaints are literally accurate.

- **Ugly.** The card was a Recharts `AreaChart` with `hide` on *both* axes, a
  filled dot on every reading, a grey fade for the fill, and the two end dates
  typed under the chart as ordinary DOM text rather than an axis. Untitled UI's
  own charts have neither of those and look nothing like it.
- **No axes.** Correct, and deliberate at the time: the previous shape of this
  card put the two dates outside the chart "so the labels are real type at the
  page's own size". That reasoning does not survive the reader asking to know
  what the line is worth at any point that is not an end.
- **Four points.** Also correct, and also not the chart's fault. Three were
  seeded by hand from two Internet Archive copies of Cardmarket's price guide,
  and `vercel.json` scheduled the recording cron `0 4 * * 1` — once a week.

Two further things were found while reading the code, neither of them reported:

- The X axis was `dataKey="date"` with no `type`, which Recharts treats as a
  **category** axis — evenly spaced by position in the list. `lib/core/value-chart.ts`
  had gone to some length to space X by elapsed time and to write down why, and
  that intent was silently dropped when Recharts replaced the hand-drawn SVG.
- `chartPoints` was still computing `line`, `under`, `x` and `y`; nothing had
  read any of them since that same rewrite.

## Interpretation

"Like the standard Untitled chart" is a specific, checkable thing rather than a
vague wish, because the repo already vendors the parts: `charts-base.tsx` ships
the tooltip, the hover dot, and `selectEvenlySpacedItems`, whose own docstring
says it exists "for rendering certain number of x-axis labels" — a hint the
card had never taken.

The third message is the one with a limit in it, and the limit is worth being
straight about: making the cron daily makes the series denser **from now on**
and cannot invent a past. There is no archive to backfill from — the snapshot
script went looking already and its docstring says so. Daily is also the ceiling
rather than a preference: this is a Vercel Hobby project (2 crons, once a day),
and the price guide it reads is only rebuilt nightly anyway.

## What was done

See ADR-0085. Real X and Y axes with rounded tick values, horizontal gridlines,
the brand colour, no dots except on hover, a taller chart, the time axis
restored, the dead geometry removed, and the cron moved to daily.

Related: [[0010-the-skeleton-loader-draws-an-interface-that-is-not-in-the-app]]
is the same pattern — a second copy of an intent drifting away from the first
without anybody noticing.
