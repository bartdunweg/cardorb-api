---
id: ADR-0017
title: Never give a conditionally-reset property to Tailwind unconditionally
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [css, tailwind, bug]
---

# Never give a conditionally-reset property to Tailwind unconditionally

## Context and problem statement

Migrating `CardsSidebar.tsx`'s `.cards-rail` (the `/cards` left rail), a live
check showed the rail rendering permanently visible instead of only when
`data-pane="rail"` — the `<=1000px` "one pane at a time" swap
(`.cards-rail:not([data-pane="rail"]) { display: none }`,
`.cards-rail[data-pane="rail"] + .cards-main { display: none }`) had stopped
working. The same investigation found the bug already present, committed, in
`cardsMainClassName` (`app/components/cardsPageClasses.ts`) from the
`.page-cards`/`.cards-main` migration earlier in the session.

The mechanism is a second-order consequence of ADR-0012's cascade-layers fix:
once Tailwind utilities correctly outrank legacy CSS regardless of the legacy
rule's specificity, giving a class an *unconditional* Tailwind utility for a
property that a *surviving, still-CSS* media query or attribute selector
conditionally resets makes the Tailwind utility win everywhere, including in
the case the CSS rule exists specifically to override. Both `.cards-rail`
and `.cards-main` had this shape: `display` (and, for the rail, `position`/
`height`/`overflow`/`border-right`/`box-shadow`) is toggled by the pane-swap
logic, which is deliberately staying CSS-owned (ADR-0009/0010's "keep the
class name as a cross-file hook" pattern) — but the initial migration attempt
gave `display`/`position`/etc. to Tailwind anyway, because those properties
also appear in the *unconditional* part of the original rule.

## Considered options

1. **Audit every property individually before adding it to Tailwind**,
   checking whether any surviving CSS rule (in this file or elsewhere)
   conditionally overrides it, and exclude those from the Tailwind migration
   for that class — leaving the *whole* property, base value included, in
   CSS rather than splitting a property's unconditional and conditional
   values across two systems.
2. **Replicate the conditional logic in Tailwind too** (e.g.
   `data-[pane=rail]:flex` `[@media(max-width:1000px)]:hidden` etc.),
   porting the entire toggle to Tailwind and deleting the CSS rule outright.

## Decision

Option 1, for `.cards-rail` and `.cards-main` specifically. Both cases
involve a `+` sibling combinator reaching *across component files*
(`CardsSidebar.tsx` and wherever `.cards-main` is rendered) — porting that to
Tailwind's `peer`/`group` mechanism would require marking the rail `peer`
and threading a matching `peer-data-[pane=rail]:hidden` onto every place
`.cards-main` is rendered, which is more moving parts across more files than
leaving five properties (`display`, `position`, `height`, `overflow`, plus
`.cards-rail`'s `border-right`/`box-shadow`) in CSS, unmigrated but correct.

The properties that stayed CSS-only for `.cards-rail`: `display`,
`flex-direction`, `border-right`, `box-shadow` (light and dark), `position`,
`top`, `height`, `overflow-y`, plus their `<=1000px` reset. Everything else
(`gap`, `padding`, `background`, `backdrop-filter`) moved to Tailwind, since
nothing resets those. For `.cards-main`: `display`/`flex-direction` stayed
CSS; `min-width`, `container-type` (as Tailwind's `@container` class), `gap`,
`padding` (and its `<=1000px` override) moved to Tailwind.

## Consequences

- Good, because both panes now toggle correctly — confirmed live by setting
  `data-pane="rail"` via `getComputedStyle` checks in the browser, not just
  visual inspection.
- Good, because this generalizes into a checkable rule for every remaining
  `cards.css` class kept as a hook: before adding *any* Tailwind utility to
  it, grep the file for other selectors targeting that class and check
  whether they touch the same CSS property. If they do, that property stays
  CSS-only, full stop — don't split a property's base value into Tailwind
  and leave only the override in CSS.
- Bad, because this is the second cascade-layers-adjacent bug found this
  session after ADR-0012 (the first being `tabbarClasses.ts`'s dead desktop
  branch) — worth treating as a standing risk for the remainder of the
  `cards.css` migration, not a one-off.
- Neutral, because `mechanics.test.ts`'s `.cards-main` container-type
  assertion needed updating to read `cardsPageClasses.ts` instead of
  `cards.css`, per that file's own "when a rule moves, change the path"
  contract.

## Confirmation

Live-verified via `getComputedStyle` in the browser: rail hidden/main shown
with no `data-pane` (landing state), rail shown/main hidden with
`data-pane="rail"` set programmatically, and the `<=1000px` `position:static`
reset applying correctly in the same check. `npm run typecheck`,
`npm run test` (301 tests, `mechanics.test.ts` updated) and `npm run lint`
all pass.

## Related

- Supersedes: none
- Related: ADR-0012 (the cascade-layers fix this is a consequence of),
  ADR-0009/0010 (the "keep as cross-file hook" pattern this follows)
- Code: `app/components/CardsSidebar.tsx`, `app/components/cardsPageClasses.ts`,
  `app/styles/cards.css`, `lib/design/mechanics.test.ts`
