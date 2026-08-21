---
id: ADR-0085
title: The value chart gets two real axes, Untitled UI's styling, and a nightly reading
status: accepted
date: 2026-08-22
scope: repo
deciders: [Bart, Claude]
supersedes: null
superseded-by: null
tags: [interface, charts, dashboard, untitled-ui, data, cron]
---

# The value chart gets two real axes, Untitled UI's styling, and a nightly reading

## Context and problem statement

The owner looked at `/dashboard` and said the "Value over time" card was very
ugly, asked for it to look like Untitled UI's standard chart, said there did not
need to be circles on the line, then added that it **must** have a Y axis and an
X axis, and finally that four measurement points was too few (FB-0021).

Every part of that is literally accurate. The card was a Recharts `AreaChart`
with `hide` on both axes, a filled dot on every reading, a grey fade, and the
two end dates typed underneath as ordinary `<p>` text.

Reading the code to change it turned up two things nobody had reported.

**The time axis had quietly become a category axis.** `lib/core/value-chart.ts`
spaced X by elapsed time and wrote down why: the series is December 2024, then
June 2026, then weekly, and even spacing "would draw a year and a half of
silence the same width as a week". When Recharts replaced the hand-drawn SVG
(ADR-0075), the axis became `dataKey="date"` with no `type`, which Recharts
treats as a category — evenly spaced by position in the list. The intent was
recorded, tested, and then lost, and a hidden axis is exactly the condition
under which nobody notices.

**Most of `value-chart.ts` was dead.** `line`, `under`, `x` and `y` were still
being computed. Nothing had read any of them since the same rewrite.

## Decision

### The chart is Untitled UI's chart

| | Before | After |
|---|---|---|
| Line and fill | `--color-text-primary`, grey fade | `--color-utility-brand-600`, brand fade at 0.25 → 0 |
| Dots | `r: 4` on every reading | none; `ChartActiveDot` on hover only |
| X axis | hidden, plus two `<p>` labels | real axis, six month labels, no axis or tick line |
| Y axis | hidden, `dataMin`–`dataMax` | real axis, rounded ticks, `€40k` |
| Grid | none | horizontal only, `--color-border-secondary` |
| Height | 150px | 240px |
| Tooltip cursor | `--color-border-secondary` | `--color-utility-brand-600` |

Brand purple rather than the app's older tint blue, because `lib/design/tokens.ts`
already records that the tint is no longer this app's accent. It is one constant
if that turns out wrong.

### The Y axis frames the data, it does not start at zero

`niceScale()` rounds outwards to a step from the 1 / 2 / 2.5 / 5 × 10ⁿ family,
so the labels come out €30k / €35k / €40k / €45k.

Starting at zero was considered and rejected **against** the old file's own
comment, which argued for zero on the grounds that "a line that starts at the
lowest reading turns any wobble into a cliff". Both halves of that are true and
they pull opposite ways; the deciding fact is that this collection is worth
€40,000 and moves by €1,500. Anchored at zero, every future reading is a flat
line four fifths of the way up the card. Rounding outwards to a nice step is the
answer that avoids the cliff *and* leaves the movement visible, which is what
the zero rule was actually protecting. Chosen by the owner.

### The X axis labels are spaced by time, and neither ready-made option does it

`timeTicks()` cuts the elapsed span into equal parts, keeps the two ends exactly
on the first and last reading, and pulls the ones between back to the first of
their month.

Two simpler things were tried first and are written down so they are not tried
again:

- **Recharts' `tickCount`** on a time axis whose domain is pinned to
  `["dataMin", "dataMax"]` draws the two endpoints and nothing between them.
- **`selectEvenlySpacedItems`** from `charts-base.tsx` — the helper whose own
  docstring says it is for picking x-axis labels — picks evenly by *position in
  the list*. That is the same mistake as the category axis, one level up: with
  five of six readings inside one fortnight it returns five labels for that
  fortnight and one for the eighteen months before it, and `minTickGap` then
  throws four of them away. It was used, it produced two visible labels, and it
  is the reason this function exists.

### The reading is taken nightly, not weekly

`vercel.json` goes from `0 4 * * 1` to `0 4 * * *`. There is nothing to choose
between here — daily is both the ceiling and the resolution:

- This is a Vercel Hobby project (`maxDuration = 60` in the cron route is the
  Hobby limit). Hobby allows two cron jobs, triggered at most once a day. There
  are already exactly two.
- The job reads Cardmarket's public price guide, which is rebuilt nightly.
  Running twice a day would write the same number twice.

**This does not create history.** It makes the series denser from here on, about
seven points a week instead of one. The past cannot be backfilled:
`scripts/snapshot-collection-value.mjs` went looking and found two archived
copies of the guide, total, and says so. With four points the chart will still
look sparse for a few weeks, and that is the truth about the data rather than
something to hide.

A consequence: the tooltip said "December 2024", because a month was the honest
unit for a weekly series. Daily readings would name four points identically, so
the tooltip carries the day now. The axis labels stay month and year — a label
per daily reading is a grey smear.

Both date formats go through `toLocaleDateString` rather than `lib/format`'s
`formatDate`, which only accepts a bare `YYYY-MM-DD` and only ever writes
English. Passing it an ISO timestamp printed the raw string on the card; the
labels follow `LOCALE` like the euro figures beside them instead.

### `value-chart.ts` keeps its job, not its code

`chartPoints()` now returns the readings with a timestamp on each, and the null
guard. `line`, `under`, `x`, `y` and the `ChartBox` type are gone. The file's
reason for existing is unchanged and is worth repeating: there is no jsdom and
no RTL in this repo, so anything that can look right in a screenshot while being
wrong has to live here where it can be tested. `niceScale` and `timeTicks` are
both exactly that.

### Recharts writes `fill="#666"` on every tick, and that had to be overridden

Found during the quality review, not by looking at the code. Recharts sets the
tick colour as a **presentation attribute** on the `<text>` element, hardcoded to
`#666` in both themes. A `text-tertiary` class on the wrapper sets `color`, which
SVG text does not read, so the class did nothing.

Measured on the card surface: 5.7:1 in light, **3.45:1 in dark** — under the
4.5:1 that 12px text needs. So the wrapper also carries
`[&_.recharts-cartesian-axis-tick-value]:fill-current`. A CSS declaration beats a
presentation attribute, which hands the ticks back to the theme: 7.8:1 light,
7.7:1 dark.

This is worth knowing before adding a second chart: **any Recharts axis in this
app needs that override**, and the failure is invisible in a light-mode
screenshot.

## Consequences

- The chart is 240px rather than 150px, so the dashboard column is taller.
- One more account of the same failure mode: an intent written down in one file
  and implemented in another drifts when the second is rewritten. ADR-0018 and
  ADR-0046 are the same story about `loading.tsx`. The mitigation here is that
  the intent and the test now live next to the code that acts on it — the axis
  reads `t` from `chartPoints`, so a future rewrite that drops the time scale
  has to delete a field to do it.
- The gradient uses a fixed `id="value-over-time"`. There is one of these cards
  on the page. A second instance would collide, and Untitled UI's own charts use
  `useId()` for exactly that reason — worth copying if this is ever reused.

## Verification

- `npm run test` — 18 cases across `chartPoints`, `niceScale` and `timeTicks`.
- `./scripts/verify.sh` — format, tokens, typecheck, test, lint and build all
  pass. `standards` fails on this branch and failed before it: it is the
  `docs/` versus `.dev-standards/` placement that ADR-0053 chose deliberately,
  plus a CLAUDE.md generated from v0.22.0.
- Screenshotted in a browser at 1000px and 390px, light and dark, with the
  tooltip open — through a throwaway route, since `/dashboard` needs a session.
- Contrast measured in-page from the computed styles, rendered through a canvas
  so `lab()` colours resolve to sRGB rather than being regex-parsed wrong (the
  first attempt was, and reported 19.6:1 for a grey on white):

  | | Light | Dark |
  |---|---|---|
  | Tick labels on the card | 7.81:1 | 7.66:1 |
  | Line on the card | 4.96:1 | 7.95:1 |

  Gridlines come out at 1.26:1 and 1.31:1 and are meant to: they are decoration
  behind the data, not an element WCAG 1.4.11 covers, and the axis they belong
  to is labelled in text that does pass.
