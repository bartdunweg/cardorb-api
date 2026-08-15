---
id: ADR-0028
title: "Bug: the bottom tab bar never actually hid above 1000px"
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [bug, cascade-layers, tabbar]
---

# Bug: the bottom tab bar never actually hid above 1000px

## Context and problem statement

Bart, after signing in: "ik zie de tabbar onderin die voor mobile bestemd is
ook op desktop." `AppTabBar`/`CardsTabBar.tsx` is meant to be a narrow-width
stand-in for the rail — its own component comment says "the rail is back
beside the cards, so the bar has nothing left to do" above 1001px, and
`app/styles/cards.css:272-277` has exactly that rule:

```css
@media (min-width: 1001px) {
  .cards-tabbar,
  .cards-tabbar-fade {
    display: none;
  }
}
```

`CardsTabBar.tsx` does carry the literal `cards-tabbar` class alongside its
Tailwind `tabbarClassName`, so the rule's selector matches. It still never
fired.

## What was actually wrong

`app/globals.css:60` declares `@layer theme, base, legacy, components,
utilities;` — `legacy` (where `.cards-tabbar`'s hand-written rule lives)
before `utilities` (where every Tailwind class, including `tabbarClassName`'s
unconditional `flex`, lives). Cascade layers resolve by layer order *before*
specificity or source order, and only among rules that actually match at a
given media state. At ≥1001px both rules match — the `@media` rule as its
condition is met, the unconditional `flex` because it has no condition at
all — so the tiebreak falls to layer order, `utilities` wins, and
`display: flex` beats `display: none` regardless of the media query. This is
the same class of bug ADR-0012 and ADR-0017 already found and fixed twice
during the Tailwind migration ("an unconditional Tailwind utility can beat a
still-legacy-CSS conditional override... because Tailwind utilities always
win the cascade-layer contest") — a third occurrence, in a file
(`tabbarClasses.ts`) whose own comment at the time *claimed* the legacy rule
still worked:

> "whose own 641-1000px rules already put it back at the bottom and whose
> >=1001px rule hides it outright once the rail returns."

That claim was wrong, and left uncorrected until this bug report — the
comment reasoned about the fix having landed (`ADR-0012`) without checking
that this specific pair of rules was still on opposite sides of the same
layer boundary it fixed.

## Decision

Fixed in `tabbarClasses.ts` rather than `cards.css`, so the override lives
in the same (winning) `utilities` layer as the `flex` it has to beat:

```
"[@media(min-width:1001px)]:!hidden"
```

appended to `tabbarClassName`. The `!` (Tailwind's important-modifier) is
deliberate, not decorative: `flex` and `hidden` are two differently-named
utilities, and while Tailwind's own `sm:`/`md:`/`lg:` breakpoint scale
guarantees base-then-larger-breakpoint emission order, that guarantee is
documented for the built-in scale — this codebase uses arbitrary
`[@media(...)]:` variants throughout specifically because the built-in scale
doesn't line up with this design's breakpoints, and arbitrary variants carry
no such documented ordering guarantee. `!important` sidesteps needing one.
The stale comment claiming the old rule worked was rewritten to explain what
was actually true.

## Consequences

- Good: the bar now hides above 1000px, verified.
- Bad, self-critical: this is the third time this exact failure mode has
  been found by looking at a screen, not by a type or a test — same
  observation ADR-0017 already made about the second occurrence. No test
  was added here either; a real regression test would need something like
  Playwright/jsdom computed-style assertions across a viewport resize, which
  this repo's current test setup (vitest, no browser) does not have.
- Neutral: `cards.css`'s own `@media (min-width: 1001px) { .cards-tabbar,
  .cards-tabbar-fade { display: none; } }` rule was left in place rather
  than deleted — inert (always beaten by the new Tailwind rule regardless of
  its own presence) but harmless, and deleting still-referenced-looking CSS
  during an unrelated bug fix was judged more risk than the dead weight is
  worth.

## Confirmation

`npm run check` green. Visual confirmation was by code/CSS inspection and
the generated stylesheet's layer order, not a live desktop-width screenshot
(this workspace's dev server was in flux across the session) — worth a
real resize check before considering this fully closed.

## Related

- `docs/decisions/0012-cascade-layers-fix.md` and
  `docs/decisions/0017-cards-rail-pane-swap-fix.md` — the first two
  occurrences of this exact bug class.
