---
id: FB-0022
date: 2026-08-22
source: Bart
source-type: stakeholder
severity: 1
sentiment: neutral
status: addressed
tags: [tabbar, layout]
---

# The mobile tab bar's slots are unequal, and the avatar slot is the narrowest of them

## What was said

> In de tabbar op mobiel moeten alle tabs even breed zijn. Momenteel is de avatar
> minder breed dan de rest. Alle tabs moeten dezelfde breedte hebben, en neem
> daarvoor de breedte van de breedste variant aan.

*Every tab in the mobile tab bar has to be the same width. Right now the avatar
one is narrower than the rest. All tabs the same width — take the widest
variant's width for it.*

And, correcting a full-width capsule that had just been agreed to in the same
session:

> O ja, niet op die manier vol de breedte. Hij moet de breedte worden van…
> iedere capsule moet, zeg maar, de breedte worden van het breedste label, snap
> je? Dus dan is de totale breedte van de hele navbar bij elkaar opgeteld, als je
> de paddings/margins natuurlijk ook meeneemt.

*Oh, no, not full width like that. It should become the width of… every capsule
should become the width of the widest label. So the whole navbar's total width is
those added up, paddings and margins included of course.*

## Context

The floating bottom bar shown below 1000px on every signed-in screen
(`CardsTabBar.tsx` via `AppTabBar.tsx`). Four slots — Dashboard, Collection,
Wishlist, You — with the avatar in the last one. Reported by eye, not measured.

## Interpretation

The avatar slot is not narrow because of the avatar: it is `size-5`, the same
20px as every other icon. Since ADR-0050 a slot is exactly as wide as its own
label, and "You" is the shortest of the four. So this is a request to undo the
half of ADR-0050 that made slot width follow the label — without undoing the
overflow fix that was its whole point.

The second quote matters more than it reads. "Full width" and "as wide as the
widest label" are two different layouts, and the first one was picked and
withdrawn within a minute. What is wanted is the capsule still hugging its
content, with the content now being four equal tracks instead of four different
ones.

## Action

- [x] Equal tracks via CSS Grid `fr`, which sizes every track to the widest by
      definition and still lets them shrink together on a narrow phone — ADR-0086.
- [x] The add circle leaves the bar to make four equal slots fit a 360px phone,
      explicitly as a temporary move. That is a separate decision with its own
      cost, recorded in ADR-0086 rather than here.

## Related

- Decision: ADR-0086 — the change this asked for.
- Decision: ADR-0050 — the half of it this reverses, and the failure it must not
  reintroduce. FB-0011 is the report behind that one.
- Decision: ADR-0030 — the first, JavaScript-measured attempt at equal widths.
- Changelog: `docs/changelog.d/2026-08-22-tabs-are-all-one-width.md`
