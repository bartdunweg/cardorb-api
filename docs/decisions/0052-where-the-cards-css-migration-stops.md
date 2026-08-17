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

**Update, same day.** The harness gained a signed-in session (see ADR-0051's
amended consequences), and a fourth portion then moved four more classes:
`cards-head`, `cards-main-title`, `cards-nav` and `cards-nav-item`'s pseudo-
element. cards.css is 1,169 lines.

Two of those four were not migrations at all but **deletions of duplicated CSS**:
`cards-nav` and `cards-nav-item` already carried their full Tailwind equivalent
inline on the element, so the stylesheet rule was a second copy that could only
ever drift. `.cards-rail` is in the same state — its width and padding live on
the element in `CardsSidebar` — which is why an early attempt to prove the
harness by changing the rail's `padding-top` did nothing at all.

**What is still untouched, and now for one reason rather than two:** — `cards-rail`, `cards-main`,
`cards-search` and the `filter-menu` family.

`cards-rail` and `cards-main` are the pane swap: `[data-pane="rail"] + .cards-main`
is an attribute selector reaching an adjacent sibling, plus a keyframe animation.
ADR-0017 is the bug where an unconditional Tailwind property beat exactly this
conditional reset. It is the one place in this file where the CSS is not a
remnant but the mechanism.

`cards-search` is six rules deep into its own children — `input`,
`input::placeholder`, `input::-webkit-search-cancel-button`, `button`,
`button:hover` — plus two breakpoints, and `filter-menu-panel` is the 118-line
case above. Both are components with internal structure, and moving them means
moving markup in two consumers each, one of which is the add-card dialog.

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
