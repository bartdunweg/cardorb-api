---
id: ADR-0052
title: Where the cards.css migration stops, and why that is not halfway
status: accepted
date: 2026-08-17
scope: repo
deciders: [Bart]
superseded-by: null
tags: [tailwind, css, migration]
---

# Where the cards.css migration stops, and why that is not halfway

## Context and problem statement

ADR-0051 built a screenshot harness so this migration could be finished without
repeating ADR-0012, 0017, 0018 and 0020. Three portions were then moved under it.
This records where it stops and, more usefully, the rule for deciding that —
because "finish the migration" and "leave it alone" have both been asserted in
this repo without anyone measuring which classes were actually worth moving.

## Decision

**A class moves when the move makes it easier to read. It stays when it does not.**

Measured per class rather than argued: how many of its declarations have a
Tailwind utility as opposed to needing an arbitrary `[...]` value, how many
selectors it has that reach a descendant, and how much explanatory comment hangs
off it.

**Moved** — 12 classes over three portions, cards.css 1,300 → 1,203 lines:

- the set header (`cards-set-head`, `-logo`, `-text`, `-name`, `-meta`)
- the heading row and toolbar (`cards-head-title`, `-logo`, `cards-tools`,
  `cards-count`)
- the leftovers (`cards-set`, `cards-more`, `cards-nav-elsewhere`)

**Staying, and this is the substance of the decision:**

- **`filter-menu-panel`** — 118 declarations, 42 of them arbitrary values, and
  **23 descendant selectors**. Translating that is 23 `[&_…]` variants in one
  string. It is possible and it is unreadable.
- **`sheet`, `modal`, `modal--card`, `modal--sheet`, `cards-item`** — the same
  shape: dialog and card-tile machinery, 8 to 18 arbitrary values each,
  descendant selectors throughout.
- **`cards-grid`** — only 9 declarations, but 3 arbitrary and **11 lines of
  comment** that carry the reasoning: why `content-visibility` is there, why the
  negative margin and matching padding exist (paint containment was slicing the
  scans' drop shadow off in a straight line down both edges), and why the columns
  come from `--cards-cols`. A className string is not a place that survives.
- **`cards-rows`** — simple enough on its own, and kept anyway because it is the
  other half of `className={view === "grid" ? … : …}`. Splitting a pair across
  two systems is the "two places to look" cost this migration is meant to remove,
  paid twice.

**And ten classes are untouched for a different reason: they render behind a
login the harness has no session for** — `cards-rail`, `cards-nav`,
`cards-nav-item`, `cards-main`, `cards-main-title`, `cards-head`, `cards-search`,
`filter-menu` among them. ADR-0020 is precisely a bug that hid behind a login.
These are not judged either way; they are unverifiable, and moving CSS that
nothing can check is how the previous four attempts went wrong. A stored session
for a test account is the one change that would let them be judged at all.

## Consequences

- Good, because the remaining cards.css is now the part that is genuinely better
  as CSS, rather than the part nobody got to.
- Good, because two design tests followed their classes out of the stylesheet —
  the build-out tripwire's `height: 1px` and the set logo's stated width. Both
  guard real bugs (an IntersectionObserver with no box; a logo zero-wide until a
  file that never loads). Nothing but those tests would have noticed the
  guarantee had changed address, which is the ADR-0018 failure mode caught by the
  gate this time.
- Good, because **one dead class was found and deleted**: `.cards-dash-set`, a
  narrow-width rule for a dashboard column that no longer exists in any markup.
  It also corrects a claim made earlier the same day that cards.css had zero dead
  classes — that measurement matched class names against `.tsx` too loosely.
- Bad, because the split is now permanent and deliberate rather than temporary
  and forgotten: a reader still checks two places for some components. That is
  the price of the rule above, taken knowingly.
- Neutral, because `max-sm:[&_.btn]:flex-[0_0_auto]` in `cardsToolsClassName` is
  the one descendant selector translated rather than avoided. It kept the scope
  the CSS had, where putting `flex-none` on each button would have leaked a
  toolbar rule onto a class the whole app shares. It reads worse than the CSS did
  and is still the better of the two.

## Confirmation

- Nine screenshots pixel-identical after every portion, at three widths.
- `scripts/verify.sh` green after each.
- Not confirmed: anything behind a login, which is stated above rather than
  discovered later.

## Related

- Builds on: ADR-0051 (the harness)
- Repairs the reasoning of: ADR-0012, 0017, 0018, 0020
- Code: `app/components/cardsPageClasses.ts`, `app/styles/cards.css`,
  `lib/design/mechanics.test.ts`
