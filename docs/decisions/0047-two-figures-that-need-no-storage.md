---
id: ADR-0047
title: What the wishlist costs, and where the binder sits against its own average
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [dashboard, pricing, stats]
---

# What the wishlist costs, and where the binder sits against its own average

## Context and problem statement

Two questions the dashboard could already answer and did not, both from data
that was on every card the whole time.

**The wishlist tile said how long the list was and not what it would cost.**
That is the obvious next question, and the wishlist screen itself cannot answer
it: it deliberately shows no money.

**"Collection value €41,616" has no sense of scale.** The chart below it gives
one, but only for an account that has been snapshotted twice — which, until
ADR-0046's cron has been running a while, is one account. A brand-new signup
sees a number with nothing to compare it to.

Cardmarket publishes `avg30` beside every price and `priceOf()` already carries
it through onto `Price`. So the second question is answerable with no history,
no storage, no fetching and no cron — on an account's first day.

## Considered options

For the movement figure:

1. **`market` against `avg30`** — both raw Cardmarket figures.
2. **`shownPrice()` against `avg30`** — the number the tile actually shows,
   against the average.
3. **Compare against the previous snapshot** instead, which is real history.

For the wishlist total:

4. **One copy per wanted card.**
5. **Copies, the way `copiesHeld()` counts the binder.**

## Decision

(1) and (4).

**`market` against `avg30`, never `shownPrice()` against `avg30`.** This is the
whole of why the decision is worth recording. `shownPrice()` answers with
`nm.mid`, the Near Mint estimate, which is `market` multiplied by a band from
`NM_BANDS`. Comparing that to a raw thirty-day average reports the band as
market movement: a card sitting exactly on its own average would show a premium
of ten or twenty percent, every day, for ever, and it would look like a
collection that is permanently outperforming. The two sides have to share a
basis, and the shared one is Cardmarket's own.

Only cards carrying both figures count, on both sides, so the ratio is over one
set of cards rather than two.

(3) was rejected as a different feature rather than a worse one. It answers "how
has this changed since we last looked", which is the chart's job, and it is
worth nothing until there are two points. This answers "is today's number high",
needs nothing stored, and works immediately.

(5) was rejected because a quantity on a wishlist row is a wish, not a holding.
The app never asks how many of a card you want, and "buy the list once" is what
a collector means by what their wishlist costs.

Two presentation calls, both recorded because they will look arbitrary later:

- **Below a tenth of a percent it says "level with its 30-day average"** rather
  than "0.0%". At that size the figure is rounding inside Cardmarket's own
  averages, and a tile that reports noise daily teaches people to stop reading
  it.
- **The direction is a word, not a colour or an arrow.** Up is not good news
  here — good if you are selling, bad if you are still buying — and the same
  screen carries a wishlist. Green and a triangle would decide that for the
  reader.

## Consequences

- Good, because both figures cost nothing: no table, no cron, no request. They
  are derived from the collection the page already holds.
- Good, because the movement figure works on day one, which is exactly when the
  chart cannot.
- Bad, because `market` and `avg30` are not what the tile above the note
  displays, so a reader who does the arithmetic themselves against the euro
  figure will not reproduce the percentage. Judged acceptable: the alternative
  is a number that is consistently and invisibly wrong.
- Bad, because a note on two of four tiles makes those two taller. They are
  cells in a wrapping grid rather than columns that must align, so this is a
  ragged edge rather than a broken layout.
- Neutral, because both are absent rather than zero when nothing can be
  computed. A binder nobody could price has not held steady; it is unknown, and
  the two read identically unless one of them is missing.

## Confirmation

`lib/core/cards-stats.test.ts` covers the trap directly: a card whose `market`
equals its `avg30` but which carries an `nm` range must report **zero**
movement, while the value tile still uses the Near Mint estimate. If the two
bases are ever crossed, that test fails. Also covered: movement weighted by
copies held, cards missing either figure excluded from both sides, and the
wishlist priced per card rather than per printing.

## Related

- Context: ADR-0044 (copies, and why the value tile counts them), ADR-0046 (the
  cron, and why this deliberately does not need it)
- Code: `lib/core/cards-stats.ts`, `app/components/CardsDashboard.tsx`,
  `lib/core/price-basis.mjs` (`NM_BANDS`, and why the bands exist)
