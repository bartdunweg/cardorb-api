---
id: ADR-0019
title: FilterOptions.tsx's facet-* classes stay CSS-styled by ancestor, not a Tailwind variant prop
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [css, tailwind]
---

# FilterOptions.tsx's facet-* classes stay CSS-styled by ancestor, not a Tailwind variant prop

## Context and problem statement

An earlier planning pass for this migration flagged `FilterOptions.tsx`/
`ViewOptions.tsx` as needing "a genuine design change (variant prop)" before
their remaining `cards.css` classes could move to Tailwind, since each is
shared between two different-looking hosts: `FilterMenu`'s dropdown and
`FilterSheet`'s mobile sheet (same split for `ViewMenu`/`ViewSheet`).

Reading `FilterOptions.tsx`'s own top-of-file comment while doing this pass
showed that split was already a deliberate, documented decision, not
oversight: "One markup, one set of class names, styled by whichever wrapper
it lands in. `.filter-menu-panel .facet-row` is a compact dropdown row;
`.sheet .facet-row` is a 48px target for a thumb. That difference is real and
stays in CSS, which is where it belongs." The component was written to avoid
exactly the duplicate-markup problem a variant prop would reintroduce.

## Considered options

1. **Add a `variant: "menu" | "sheet"` prop to `FilterOptions`/`ViewOptions`**
   and pick Tailwind classes per row from it — makes every facet class
   Tailwind, but duplicates every conditional (`sizeClass`, `paddingClass`,
   etc.) that the ancestor selectors currently express in one line each, and
   reopens the exact drift risk (dropdown and sheet rows disagreeing) the
   shared-component refactor was written to close.
2. **Leave `.facet-back`/`.facet-row`/`.facet-name`/`.facet-count`/
   `.facet-clear`/`.facet-inline`/`.facet-list`/`.facet-on`/`.facet-head` as
   CSS, styled by `.filter-menu-panel <x>` vs `.sheet <x>` ancestor
   selectors** — keep the existing, already-reasoned design; migrate only the
   parts of `cards.css` that were genuinely unmigrated shell (the menu/sheet
   chrome, extracted to `MenuDetails.tsx`/`Sheet.tsx` this session) rather
   than the shared rows themselves.

## Decision

Option 2. No variant prop was added. `FilterOptions.tsx` and `ViewOptions.tsx`
keep rendering plain `facet-*`/`view-field`-style classes for the elements
where a dropdown and a sheet really do look different, and `cards.css` keeps
styling them by ancestor. What *did* move this session were the parts that
were genuinely just shell duplicated across two files by hand: the
details/summary/panel wrapper (`MenuDetails.tsx`), the bottom-sheet wrapper
(`Sheet.tsx`), and `ViewOptions.tsx`'s own `.sheet-field`/`.sheet-label`/
`.view-fields`/`.view-field`/`.cards-count-picker`/`.cards-count-option` rows,
none of which differ between the two hosts.

## Consequences

- Good, because this avoids inventing a variant-prop abstraction for a
  distinction that was already correctly modelled as "the same markup, two
  ancestors" — the simpler design wins without a rewrite.
- Good, because it keeps `FilterMenu`/`FilterSheet` (and `ViewMenu`/
  `ViewSheet`) from ever drifting again on the properties that differ, which
  is the bug this component was built to prevent in the first place.
- Neutral, because `cards.css` will permanently keep a `.filter-menu-panel
  .facet-*` / `.sheet .facet-*` block — this is not migration debt, and a
  later pass should not try to "finish" it.

## Confirmation

`npm run typecheck`, `npm run test` (301 tests) and `npm run lint` pass.
`FilterOptions.tsx`'s and `ViewOptions.tsx`'s own comments state this split is
intentional; this record exists so a future pass doesn't reopen the question
without reading them.

## Related

- Related: the `MenuDetails.tsx` and `Sheet.tsx` extractions (this session),
  which moved the genuinely-shared shell to Tailwind/React instead.
- Code: `app/components/FilterOptions.tsx`, `app/components/ViewOptions.tsx`,
  `app/styles/cards.css`
