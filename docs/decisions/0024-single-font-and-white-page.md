---
id: ADR-0024
title: One font (Inter) and a white page background, site-wide
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [design-tokens, typography, colour]
---

# One font (Inter) and a white page background, site-wide

## Context and problem statement

Two established tokens changed on explicit instruction this session, both
against the values the Tailwind-migration design-token work had settled on:

- `--font-main` (headings/labels) was Satoshi, loaded via `next/font/local`;
  `--font-body` was Inter, via `next/font/google`. Bart: "kunnen we overal
  Inter font voor gebruiken."
- `--color-bg-grouped` (the page) was `#fafafa` in light mode, deliberately
  a shade off `--color-bg-surface`'s `#ffffff` so cards would read as
  "above" the page (see the token's own former comment, quoted in the diff).
  Bart: "de pagina niet grijs maar wit, standaard bg van hele tool moet wit."

## Considered options

For the font: keep Satoshi for headings only (the narrower, more
conservative reading of "use Inter more"). Rejected — Bart's wording was
unqualified ("overal", "everywhere"), and a follow-up bug report (headings
clipping at their own `leading-[0.98]`, tuned for Satoshi's metrics)
confirmed the change was being taken literally, not partially.

For the background: keep `bgGrouped` distinct and only lighten it. Not
raised as an option; instructed directly.

## Decision

`--font-main` now resolves to `var(--font-inter, ...)`, same as
`--font-body` — both point at the one loaded family. `app/layout.tsx`
dropped its `localFont` Satoshi load entirely (the `.woff2` files in
`app/fonts/` are now unused but left on disk, not deleted, since nothing in
this session's instructions asked for that and removing font assets is a
separate, easily-reversible cleanup).

`colour.bgGrouped.light` (`lib/design/tokens.ts`) changed from `#fafafa` to
`#ffffff`. `colour.bgSurface.light` is unchanged at `#ffffff`, so light-mode
cards no longer read as "above" the page by colour — only by border and
shadow now. Dark mode (`#181818` page, `#101010` card) is untouched; the
same "card reads darker than page" relationship still holds there.

## Consequences

- Good: matches the explicit instruction, verified visually.
- Bad, and fixed in the same session: the hero/section headings' custom
  `leading-[0.98]` (tighter than the design system's own `--lh-tight: 1.2`)
  was tuned for Satoshi and clipped accented characters and descenders under
  Inter (e.g. the "é" in "Pokémon"). Changed to `[line-height:var(--lh-tight)]`
  throughout `app/page.tsx`.
- Bad, and fixed in the same session: several `max-w-[Nch]` headline widths
  were tuned for Satoshi's narrower average character width and wrapped one
  line longer than intended under Inter. Widened case by case (documented
  inline in `app/page.tsx` at each site) rather than by a blanket formula,
  since each heading's intended line count differs.
- Bad, and fixed in the same session: `lib/design/tokens.test.ts` had one
  contrast-regression test (`light: #767676 is under AA on the page and the
  glass...`) whose premise was the removed `#fafafa` page colour. Removed
  rather than "fixed", since the case it guarded against no longer exists —
  `#767676` was always going to clear AA on pure white, which is exactly
  what the test's own comment called "the half that explains why it was
  tempting."
- Neutral: `--color-bg-grouped`'s generated value in
  `app/styles/tailwind.generated.css` is produced by `scripts/gen-tokens.mjs`
  from `lib/design/tokens.ts` — regenerated as part of this change, not
  hand-edited.

## Confirmation

`npm run check` (typecheck, test, lint) green after the token change, the
line-height fix, the heading-width fixes, and the test removal.

## Related

- The Tailwind-migration work (see `STATE.md`'s "Since then" history) that
  originally set both tokens to their prior values, for the reasoning being
  reversed here.
