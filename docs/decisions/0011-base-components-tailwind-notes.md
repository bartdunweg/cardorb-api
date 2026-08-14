---
id: ADR-0011
title: base.css/components.css to Tailwind — dead code found, .btn stays CSS
status: accepted
date: 2026-08-14
scope: repo
deciders: [Bart]
superseded-by: null
tags: [css, tailwind]
---

# base.css/components.css to Tailwind — dead code found, .btn stays CSS

## Context and problem statement

Continuing the Tailwind migration (ADR-0013 through ADR-0010) with
`app/styles/base.css` and `app/styles/components.css`. Two findings changed
scope mid-chunk:

1. `.btn` (Button.tsx's base class) turned out to be rendered as a raw
   `className="btn"` string on a plain `<button>`/`<Link>` in ~20 files, most
   of them in the not-yet-migrated cards.css family (CardNav, CardsSidebar,
   FilterSheet, ViewSheet, CardAddDialog, ...). An initial attempt moved
   `.btn`'s recipe into `Button.tsx` itself (mapping `className="btn--primary"`
   etc. to Tailwind strings internally) — this only helps the call sites that
   render through the `Button` component, silently leaving the other ~16 raw
   `<button className="btn">` elements with no styling at all once
   components.css's `.btn` rule was deleted.
2. While restoring the "glass control" recipe for `FormInput`
   (`app/components/FormField.tsx`), found that ADR-0007's migration of
   `form.css` had already dropped it by accident: `.cards-profile-field
   input` was one of eight selectors in components.css's shared "GLASS
   CONTROL"/"CONTROL"/pill-radius groups, and removing that class name in
   ADR-0007 silently lost the login/signup/password fields' border,
   background, backdrop-blur, shadow, height and radius — a real regression
   that shipped for one chunk before this pass caught it.

## Considered options

For (1): **move `.btn`'s recipe into `Button.tsx`** (only fixes call sites
that use the component) vs. **keep `.btn` and its four modifiers as CSS**, in
what's left of components.css, deferring the full port to whichever future
chunk touches the ~16 files that render a bare `<button className="btn">`
directly.

For (2): **restore the recipe as a shared Tailwind constant** (a new small
file) vs. **inline the recipe's Tailwind classes directly onto `FormInput`**,
since it is currently components.css's only migrated consumer of that exact
combination.

## Decision

(1) Reverted the `Button.tsx` change and kept `.btn`/`.btn--primary`/
`.btn--icon`/`.btn--center`/`.btn--back` as CSS. Porting `.btn` correctly
means touching every file that renders one, which is squarely the
cards.css-family chunk's job, not this one's.

(2) Inlined the glass-control recipe directly onto `FormInput` — it is a
one-consumer fix right now, so a shared constant would be a file for a
audience of one.

Also dropped two genuinely dead things while reading the file: `@keyframes
pageEnterFlat` (base.css — a repo-wide grep found no `animation:` naming it;
ported from the portfolio's `/resume` page, which does not exist here) and
`@keyframes play-badge-spin` (components.css — no `.play-badge` consumer
anywhere). `html`/`body`'s own rules moved to Tailwind classes directly on
those elements in `app/layout.tsx`; `#main-content > .is-fallback`'s
animation moved to a direct class on `(app)/loading.tsx`'s root element,
since that selector only ever matched the one place. `.about-card`'s
remaining border/glass/shadow (the padding/clip half left components.css in
an earlier chunk) moved into `Card.tsx`/`CardsDashboard.tsx` — no cross-file
coupling found for it, unlike `.btn`.

## Consequences

- Good, because the `FormInput` regression from ADR-0007 is fixed rather
  than carried forward silently.
- Good, because `Button.tsx` did not end up half-covering `.btn` in a way
  that looked done but wasn't — the remaining ~20 files are an honest,
  visible TODO in components.css's own header comment rather than a
  half-migrated abstraction.
- Neutral, because `.btn` is now the single largest remaining CSS-owned
  surface outside the cards.css family proper — worth flagging as the
  natural first task when that chunk starts.
- Bad, because this session shipped one real regression (item 2) before
  catching it — worth a standing reminder for the remaining chunks: when a
  class name is deleted, grep components.css (not just cards.css) for
  grouped selectors that also named it.

## Confirmation

`npm run typecheck`, `npm run test` (313 tests, `mechanics.test.ts` updated
to read `app/layout.tsx` instead of the deleted `base.css` rules) and
`npm run lint` all pass. Grepped for `.btn` usage across the repo before
deciding to keep it as CSS; grepped `cards.css` for every remaining
components.css selector to confirm no further hidden coupling.

## Related

- Supersedes: none
- Related: ADR-0007 (the regression's origin), ADR-0009, ADR-0010 (same
  cross-file-hook shape of problem)
- Code: `app/components/FormField.tsx`, `app/components/Button.tsx`,
  `app/components/Card.tsx`, `app/styles/components.css`, `app/layout.tsx`
