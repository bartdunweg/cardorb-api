---
id: ADR-0010
title: tabbar.css/layout.css to Tailwind — exact breakpoints, --main-pad-top relocated
status: accepted
date: 2026-08-14
scope: repo
deciders: [Bart]
superseded-by: null
tags: [css, tailwind]
---

# tabbar.css/layout.css to Tailwind — exact breakpoints, --main-pad-top relocated

## Context and problem statement

Continuing the Tailwind migration (ADR-0013 through ADR-0009) with
`app/styles/tabbar.css` and `app/styles/layout.css` (a `max-width:640px`
override of tabbar.css's own rules, so the two had to migrate together). Two
things needed a decision:

1. `app/styles/cards.css` (not yet migrated) has descendant selectors keyed
   to tabbar.css's class names — `.cards-tabbar .tabbar-pages`,
   `.cards-tabbar .tabbar-item.is-active`, `.cards-tabbar .tabbar-label` —
   and `lib/hooks/useSlidingPill.ts` queries `.tabbar-item.is-active`
   directly via `querySelector`. Same shape of problem as ADR-0009's modal
   one, on the app's primary navigation this time — much higher blast radius
   if a class name goes missing.
2. tabbar.css deliberately splits its responsive behaviour at
   `max-width: 640px` (mobile) and `min-width: 641px` (desktop) — never both
   — so the two ranges cannot both match at one viewport width. Tailwind's
   default `sm`/`max-sm` are `>=640px`/`<640px`, which would show *desktop*
   styling at exactly 640px instead of the mobile styling the original gave
   it at that width.
3. tabbar.css's own `#main-content` rule redefined `--main-pad-top: 160px`
   inside a `@media (min-width: 641px)` block — a component file reaching
   into a token other files (the login page's negative margin, the mobile
   `#main-content` padding) also read.

## Considered options

For (1): same two options as ADR-0009 — delete the class names with the
file, or keep them as literal names alongside the new Tailwind utilities.

For (2): **accept the 1px boundary drift** from using Tailwind's `sm`/`max-sm`,
vs. **write every breakpoint as an explicit `[@media(min-width:641px)]:` /
`[@media(max-width:640px)]:` arbitrary variant**, matching the original
exactly.

For (3): **leave the redefinition in a component-owned Tailwind class
string** (`tabbarClasses.ts`), vs. **move it into `tokens.css`'s existing
"Responsive token steps" section**, alongside the tablet/mobile gutter steps
already there.

## Decision

(1) Kept `tabbar-pages`, `tabbar-item`, `is-active`, `tabbar-label` as literal
class names in `CardsTabBar.tsx` and `(app)/loading.tsx` (which draws the same
bar as a loading skeleton and needed the identical treatment), alongside new
Tailwind utility classes exported from a new `app/components/tabbarClasses.ts`.
Dropped `tabbar`, `tabbar-fade`, `tabbar-pill`, `is-ready`, `is-animated`,
`tabbar-icon` entirely — a repo-wide grep confirmed nothing outside
tabbar.css/layout.css ever read them.

(2) Wrote every breakpoint in `tabbarClasses.ts` as an explicit arbitrary
`[@media(...)]:` variant rather than `sm:`/`max-sm:`, to hold the exact
640/641 split rather than accept a 1px behavioural change on the app's nav.

(3) Moved the `--main-pad-top: 160px` redefinition into `tokens.css`'s
"Responsive token steps" section, with a comment explaining it used to live
in the one component that draws the bar this clears, but the token has other
readers.

Also found two genuinely dead rules while porting: `[data-theme="dark"]
.tabbar-pages { background: var(--glass-bg-solid); }` and `[data-theme="dark"]
.tabbar-item.is-active { color: var(--btn-primary-text); }` both re-asserted
the exact same `var()` reference the base (light) rule already used — no-ops,
since those tokens are already light/dark pairs. Dropped both rather than
port them forward as dead Tailwind classes.

## Consequences

- Good, because cards.css's dialog/tab-bar styling and the sliding-pill
  measurement both keep working unchanged.
- Good, because the exact-breakpoint approach means no behavioural change at
  the 640/641px boundary on the app's persistent navigation, which would have
  been the highest-blast-radius regression in the whole migration so far.
- Good, because `--main-pad-top` now lives with its sibling responsive
  tokens, matching tokens.css's own stated purpose ("the one place to look
  for what a token is at any viewport").
- Neutral, because `tabbarClasses.ts` is dense with arbitrary-value utilities
  (mask-image gradients, calc() chains) that are arguably less readable than
  the hand-written CSS they replaced — flagged in the original migration plan
  as an acceptable trade for this specific file, not a pattern to default to
  elsewhere.
- Bad, because `tabbar`/`tabbar-fade`/`tabbar-pill`/`is-ready`/`is-animated`/
  `tabbar-icon` class names are gone for good now — if a future cards.css
  migration pass discovers a selector depending on one of them that this
  audit missed, it will surface as a silent style loss, not an error.

## Confirmation

`npm run typecheck`, `npm run test` (313 tests, including
`lib/design/mechanics.test.ts`'s `--lock-vw` and Safari-layer assertions,
updated to read `tabbarClasses.ts` instead of the deleted `tabbar.css`) and
`npm run lint` all pass. Grepped the repo for every tabbar.css/layout.css
class name to confirm the drop list was safe before removing.

## Related

- Supersedes: none
- Related: ADR-0009 (same cross-file-hook problem, applied to modal.css)
- Code: `app/components/tabbarClasses.ts`, `app/components/CardsTabBar.tsx`,
  `app/(app)/loading.tsx`, `app/styles/tokens.css`,
  `lib/design/mechanics.test.ts`
