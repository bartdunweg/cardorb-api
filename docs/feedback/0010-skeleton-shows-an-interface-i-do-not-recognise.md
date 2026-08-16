---
id: FB-0010
date: 2026-08-16
source: Bart
source-type: stakeholder
severity: 3
sentiment: negative
status: addressed
tags: [loading, skeleton, interface, app-shell, drift]
---

# The skeleton loader draws an interface that is not in the app

## What was said

> "Ik vind die "skeleton loader" zeg maar heel raar. Hij laat nu een soort van
> de skeleton zien, maar van een interface die ik niet herken.
>
> Dus of we moeten de skeleton helemaal kloppend maken, of we gaan op een andere
> manier dit oplossen. Wat ik ook helemaal prima vind overigens."

English: "I find that skeleton loader really odd. It shows a sort of skeleton,
but of an interface I don't recognise. So either we make the skeleton fully
correct, or we solve this some other way — which is completely fine by me too."

## Context

Said unprompted, from using the signed-in app rather than from reviewing a
change. Nothing had touched `app/(app)/loading.tsx` recently; the report is about
behaviour that had been shipping for a while and that nobody had looked at with
fresh eyes.

The complaint is literally accurate, which is the part worth recording. The
fallback was written for the old single-page `/cards` route and drew that page:
a five-control toolbar, two set panels, twenty card tiles and a hardcoded
`<h1>Cards</h1>`. It then became the Suspense fallback for the entire `(app)`
route group without being re-scoped, because the slow await lives in the group's
layout. So it was standing in for `/dashboard` (which has no toolbar and no set
grids), `/settings` (which has neither, plus no cards at all) and everything
else. "Cards" is a word no screen in the app has ever had at the top of it.

An audit found roughly ten further mismatches underneath that one — the rail
missing its head row, its divider and its avatar footer; set logos at 120px
against a real 160px; card tiles hardcoding grid view against a reader whose
saved view might be list; four empty tab-bar slots rendering ~12px tall against
a real slot's ~45px, so the bar quadrupled in height on arrival.

## Interpretation

**A skeleton is a hand-maintained second copy of a layout, and second copies
drift.** `ADR-0018` already records this exact file drifting once, and its own
conclusion was "a route with a loading state is a standing reason to grep" — a
rule that depends on somebody remembering to grep. That did not scale past one
route to seven.

So the offered choice ("make it correct, or solve it another way") was answered
with the second half. Not because making it correct is impossible, but because
"correct" for a group-level fallback is undefined: there is no single shape
seven different screens share. Four options were put up; the one chosen draws
only what is provably identical on every route in the group and nothing else,
which removes the class of bug rather than this instance of it.

The generalisable rule, and the reason this is a feedback record rather than
just a bug fix: **a loading state may only draw what it can know.** Anything
route-specific belongs in that route's own `loading.tsx` or nowhere.

## Action

- [x] `app/(app)/loading.tsx` rewritten to shared chrome only. See ADR-0046.
- [x] Fixed alongside it: the tab bar's collapsed slot height, the rail's
      missing head row and avatar footer, and a rail title carrying the wrong
      word inside markup that could never be displayed.
- [x] Stale references to a deleted `app/cards/loading.tsx` corrected in
      `cards.css`, `CardsView.tsx` and `app/cards/[id]/page.tsx` — the last of
      which was citing it as the cause of a live soft-404 diagnosis.
- [ ] Not done: streaming the collection behind a Suspense boundary inside
      `AppShell`, which would delete the fallback entirely and is the better end
      state. Recorded as the rejected-for-now option in ADR-0046; the trigger to
      revisit is anyone touching AppShell's props for another reason.

## Related

- Decision: ADR-0046
- Precedent: ADR-0018, the first time this file drifted from what it stands in for
