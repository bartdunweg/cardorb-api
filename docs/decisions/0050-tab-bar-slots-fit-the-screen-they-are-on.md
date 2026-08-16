---
id: ADR-0050
title: The tab bar's slots fit the screen they are on, and the pill grows and shrinks with them
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
supersedes: null
amends: ADR-0030
tags: [tabbar, layout, tailwind, cascade-layers, intrinsic-sizing]
---

# The tab bar's slots fit the screen they are on, and the pill grows and shrinks with them

Reverses the fixed-slot-width half of ADR-0030 (`--tab-w`, `min-w-max`,
`flex-none`) and moves `.cards-tabbar-add` out of `cards.css`. ADR-0030 stands
as the record of why those were chosen; this record is why they had to go.

## Context and problem statement

Reported as FB-0011: *"De marge aan de boven- en onderkant is daar mooi, maar
links en rechts is er geen marge."* The fifth report against this one file, and
the third to be described as a missing margin. The first four were answered by
adjusting a spacing value. This one was measured first.

**Measured in a browser at a 360px viewport, signed in (four slots and the add
circle):**

| | |
|---|---|
| capsule `.tabbar-pages` | left 9, right 351, width 342 |
| its content | `scrollWidth` 352 — 10px wider than its own box |
| first slot | left **−2** — off the screen |
| last slot | right **362** — past the 360px viewport |
| pill against the capsule | **11px outside** it, left and right |
| pill against the capsule | 9px inside it, top and bottom |

So there was never a margin missing. The pill was being drawn *outside* the
capsule, and the capsule's own `p-2` had been applying correctly the whole
time. Top and bottom looked right because nothing overflows vertically. Every
previous pass that added or moved a padding value was adjusting a number that
was not in the failing path — which is why four of them shipped without fixing
it.

### Two independent causes, both confirmed by experiment

**1. Slots that cannot shrink.** `tabbarItemClassName` was
`flex-none w-[var(--tab-w,104px)]`, one measured width for every slot so that
the pill kept a single size as it slid (ADR-0030). Four such slots plus the
40px circle plus the gaps need 390px; a 360px phone leaves the track 328. A row
that cannot shrink past its content overflows, and because the track centres
its children it overflows out of *both* ends at once.

**2. A `min-w-max` that under-reserved by exactly 40px.** The track carried
`min-w-max` precisely so it could never be narrower than its slots. It resolved
to 352.586px where the content needed 390. The missing 40px is the add circle:
`.cards-tabbar-add` was `width: min(var(--control-h), 100%)`, written so the
circle could squeeze on a very narrow phone. **A percentage cannot be resolved
while the browser computes an intrinsic size**, so the whole `min()` counted as
roughly zero towards `max-content`, and the safety net was quietly sized as if
the circle were not there.

Giving the circle a plain `40px` was tried, and it proved cause 2 by producing
cause 1 in its purest form: `min-width` went to 382px, the capsule became 382px
wide on a 360px phone, and the entire capsule hung 11px off both edges of the
screen instead. Both settings produce "no margin at the edges" — one by
overflowing the capsule, the other by overflowing the display.

### And the reason none of this was written down correctly

`cards.css` had described the right layout all along:

> *The track fills the bar and the slots divide it, rather than each slot sizing
> itself: five items at their own width overflow a 360px phone, and
> `.tabbar-item` does not shrink.*

Those rules were in the `legacy` cascade layer and lost to the `utilities`-layer
Tailwind classes that replaced them, so the division they describe had not been
happening for some time. That is ADR-0012 / 0017 / 0018 / 0028's failure mode
for the fifth time, and this time it hid a warning about the exact bug being
reported.

## Decision

**Each slot is as wide as its own label, and every slot may shrink.** Chosen by
Bart from three options put to him — the other two were shortening the labels
to fit ("Home", "Cards") and keeping the names but letting them truncate on
every phone.

- `tabbarItemClassName`: `flex-initial min-w-0`, replacing
  `flex-none w-[var(--tab-w,104px)] min-w-[56px]`. `min-w-0` is the part that
  looks removable and is not: a flex item's automatic minimum is its min-content
  width, and for a `nowrap` label min-content equals max-content, so without it
  the row goes straight back to overflowing. The icon's own `shrink-0` is the
  real floor `min-w-[56px]` was pretending to be.
- `px-1.5`, was `px-2`. The four full labels are 3px too wide for a 360px phone
  at 8px and fit at 6px. It also makes the pill's inner padding equal on all
  four sides, `py-1.5` being what it already was.
- `tabbarPagesClassName`: `min-w-0`, and no `max-w` at all. `w-auto` hugs the
  content and the `<nav>`'s own `var(--space-4)` padding caps it — the old
  `calc(100vw - 2*var(--space-4))` restated that in a second place, in viewport
  units that quietly include a scrollbar between 641 and 1000px where this bar
  is still shown. `p-2` and `gap-2` are untouched: ADR-0030's "one number for
  every gap" was never what was wrong.
- `tabbarAddClassName` is a new export and `.cards-tabbar-add` is deleted from
  `cards.css`, along with the dead `.tabbar-pages { width: 100% }`, the dead
  `.tabbar-item { flex: 1 1 0 }`, and the 641–1000px block's slot-sizing rules.
  The circle is `w-[var(--control-h)]`, no `min()`. Nothing selects
  `cards-tabbar-add` by name any more, so the literal class name is gone from
  the markup too rather than being left as a hook with no reader.
- The `--tab-w` measuring `useLayoutEffect` in `CardsTabBar.tsx` is deleted
  entirely — mount, `document.fonts.ready` and a `ResizeObserver`, three hooks
  racing a font load to compute a number nothing reads now.
- `app/(app)/loading.tsx` loses its hand-computed
  `--tab-w: min(104px, calc(…))`, a second copy of the bar's arithmetic in a
  file that per ADR-0046 may only draw shared chrome. Its four skeleton labels
  get the real labels' measured widths (57 / 52 / 41 / 20px) so the capsule does
  not visibly resize the moment the real bar replaces it.

**Consequence, accepted deliberately:** the pill changes width as it slides.
`useSlidingPill` has always transitioned `width` and `height` alongside
`transform`; that capability was written and never used. ADR-0030's argument
for one fixed size — *"the pill sliding between them changes position without
also changing size"* — is the thing being traded away.

## Verified

Measured in the dev build, signed-in bar shape (four slots and the circle), for
every tab:

| viewport | capsule | margin to screen edge | pill inset l / r / t / b | labels |
|---|---|---|---|---|
| 320px | 288px | 16px | 9 / 9 / 9 / 9 | truncate ("Dashboa…") |
| 360px | 315px | 22px | 9 / 9 / 9 / 9 | all full |
| 375px | 315px | 30px | 9 / 9 / 9 / 9 | all full |
| 390px | 315px | 37px | 9 / 9 / 9 / 9 | all full |
| 800px | 315px | centred | 9 / 9 / 9 / 9 | all full |

9px is the 8px `p-2` plus the capsule's own 1px hairline. `scrollWidth ==
clientWidth` at every width — the row no longer overflows anywhere — and the
capsule is never off-screen. Below roughly 340px the labels truncate instead,
which is the price being paid by the label rather than by the layout.

## Consequences

- Slots are no longer equal width, so the bar reads slightly less like a grid.
  On a phone this is barely visible; it is what buys the full labels.
- Below ~340px "Dashboard" and "Collection" clip. This is now a graceful
  degradation with a working bar behind it, not an overflow.
- One less effect, one less CSS var, one less hand-computed formula, and ~35
  fewer lines of `cards.css`.

## The two lessons worth carrying

1. **A percentage inside a width contributes nothing to intrinsic sizing.**
   `width: min(40px, 100%)` reads as "at most 40px" and behaves as "roughly 0px"
   to any `max-content` / `min-w-max` calculation upstream of it. If something
   is meant to be counted by an intrinsic-sizing ancestor, give it a length.
2. **A spacing complaint is not always a spacing bug.** "No margin on this side"
   and "the thing is drawn outside its container" look identical on a screen and
   have nothing in common in the code. Measure the box before changing the
   number — four passes over this file did not, and the fifth found the answer
   in about ten minutes.

## Related

- `docs/feedback/0011-active-tab-pill-has-no-margin-left-and-right.md` — the report.
- `docs/decisions/0030-tabbar-profile-avatar-and-track-min-width.md` — what this
  amends, and why `--tab-w` / `min-w-max` existed.
- `docs/decisions/0010-tabbar-layout-tailwind-notes.md` — why the literal
  `tabbar-*` class names survive alongside the Tailwind utilities.
- `docs/decisions/0012-cascade-layers-fix.md`,
  `0017-cards-rail-pane-swap-fix.md`, `0018-missed-secondary-consumers.md`,
  `0028-tabbar-desktop-hide-cascade-bug.md` — occurrences one to four of the
  `legacy`-loses-to-`utilities` failure mode this makes five.
- `docs/decisions/0046-loading-fallback-draws-shared-chrome-only.md` — why the
  skeleton may not carry route-specific layout arithmetic.
