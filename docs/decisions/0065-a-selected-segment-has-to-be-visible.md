---
id: ADR-0065
title: The segmented control takes Untitled UI's ButtonGroup, and its selected state is the one value that had to be measured
status: accepted
date: 2026-08-21
scope: repo
deciders: [Bart]
superseded-by: null
amends: ADR-0056
tags: [ui, design-system, untitled-ui, tailwind, accessibility]
---

# The segmented control takes Untitled UI's ButtonGroup, and its selected state is the one value that had to be measured

## Context and problem statement

`components/custom/trackClasses.ts` drew a pill track on glass: a rounded
container, a gap, and a segment that turned into a solid brand fill when it was
the chosen one. Four places used it — `Segmented.tsx`, plus `CardsProfile`,
`FilterOptions` and `ViewOptions`, each drawing the same track by hand because
each needed its own click handling around the same look.

ADR-0056 says Untitled UI's value is the default. Asked directly which way this
one should go, given that their component looks visibly different:

> ButtonGroup overnemen zoals hij is, het mag er anders uitzien

*("Take ButtonGroup as it is, it is allowed to look different.")*

So the look is settled. What was not settled, and could not be settled by
preference, is whether their **selected** state is legible on this app's
palette.

## Decision

**`base/button-group`, not `application/tabs`.** Untitled UI's Tabs is
`Tabs`/`TabList`/`TabPanel` and announces a tablist, which is a promise that
pressing one reveals a panel. None of these four controls has a panel. A
`ToggleButtonGroup` is one answer out of N and renders the `aria-pressed`
buttons this control already had.

**Their joined-row look is taken whole.** Hairlines between segments instead of
a gap, `rounded-lg` at the ends instead of a pill, their padding and their
sizes.

**Their selected background is not, and the exception is a measurement.**
`ButtonGroup` says "this one is on" with `selected:bg-primary_hover`. Measured
on the built view menu, the chosen segment painted `rgb(250,250,250)` against
neighbours at `rgb(255,255,255)`: **1.04:1**, where WCAG 1.4.11 asks 3:1 of
anything carrying a control's state. `bg-brand-primary_alt` — the tint their own
Tabs puts behind a selected `button-brand` tab — was measured next and came out
`rgb(249,245,255)`: **1.04:1** again. Their tints are built for a page that is
not pure white, and `bg-primary` here is pure white.

The selected segment is `bg-brand-solid` with `text-white`, which measures
**4.96:1** against an unselected neighbour. That is still an Untitled UI value —
`--color-brand-600`, the one ADR-0057 already chose over the lighter blue
because a filled accent under white text needs 4.5:1 and the lighter one
measures 4.02.

This is ADR-0056's second exception used exactly as written: argued from a
measurement, not from taste, and answered with a value from the same system
rather than by reopening "what colour is selected".

## What the measurement depended on, and was broken

The 1.04:1 reading was only possible because a second bug was fixed first.
**`selected:` and `pressed:` were undefined variants across this whole
project.** Untitled UI writes its components against React Aria's data
attributes and turns those into variants with the
`tailwindcss-react-aria-components` plugin, which this repository does not
have. Tailwind v4 skips a variant it does not know, silently. So every
`selected:*` class in every vendored component emitted nothing.

The failure had the shape this migration keeps producing: the markup was right
the whole time. The chosen segment carried `role="radio"`, `aria-checked="true"`
and `data-selected="true"` — correct to a screen reader, blank to everyone else.
The already-adopted `application/table` carried the same dead class on
`highlightSelectedRow`.

Both are `@custom-variant` declarations in `scripts/gen-tokens.mjs` now, written
as `&[data-selected]` rather than the `:where()` the `dark:` variant beside them
uses: `dark:` never competes with anything on the same element, and a state
variant has to beat the unprefixed `bg-primary` sitting next to it.

## Consequences

- `trackClasses.ts` is deleted. Its four `[&_.cards-*]` width hooks in
  `FilterOptions` and `ViewMenu` go with it — the control says its own width
  now, which is one fewer instance of the reach-into-a-child-by-class-name
  arrangement ADR-0017 and ADR-0018 both record as a trap.
- **The view menu's panel had to grow from 260px to 300px.** Untitled UI's
  segment carries more padding than the pill it replaced, and at 260 the
  "Group by" row gave each of four segments 57px while "Pokédex" needed 58.
  Also `flex-auto` rather than `flex-1`: basis-0 gave "Set" (needs 22px) a 69px
  box and starved the long word.
- `MenuDetails` had to start merging `panelClassName` with `cx()` instead of
  concatenating it — a caller's own `w-*` was landing beside the hardcoded one
  rather than replacing it, and a `max-w` capped it back regardless. That file
  has since been replaced (ADR-0066), and the popover that succeeded it merges
  properly.
- `FilterOptions`' inline facet row is `selectionMode="multiple"`, not
  `Segmented`: a facet of two or three may have both ticked at once, so it is
  genuinely not a one-answer control and each segment says for itself what its
  press means.
- **Every other screen is untouched.** Of 33 screenshots, 32 came back
  pixel-identical; only the view menu moved, and deliberately.

## Alternatives considered

- **`application/tabs`.** Rejected on semantics: see above.
- **Keeping the pill track.** Rejected by the instruction quoted above.
- **Installing `tailwindcss-react-aria-components`.** Two `@custom-variant`
  lines cover every use in the vendored set (three `selected:`, two `pressed:`),
  and this project adds a dependency deliberately rather than by default —
  Recharts was the only one this whole migration took on.
