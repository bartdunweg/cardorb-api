---
id: ADR-0020
title: CardAddDialog inputs lost their glass-control styling in the cards.css migration
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [css, tailwind, bug, accessibility]
---

# CardAddDialog inputs lost their glass-control styling in the cards.css migration

## Context and problem statement

A user audit ("is everything actually Tailwind now?") turned up a real
regression, not just leftover legacy CSS. `components.css`'s "GLASS CONTROL"/
"CONTROL" grouped selectors gave `.card-add-field input` its entire visual
identity: border, glass background, backdrop blur, card shadow, control
height, font, pill radius, hover lift, and a darker border in dark mode.
`app/styles/form.css` separately gave the same selector its placeholder
colour and focus-visible border colour.

When `CardAddDialog.tsx` was migrated to Tailwind (this session, earlier
pass), the wrapping `<label>` elements were given Tailwind layout classes
directly, and the `card-add-field` class was dropped from the markup
entirely — but no Tailwind equivalent of the input's own styling was ever
written. The five `<input>` elements in the Add Card dialog have been
rendering with only a no-op placeholder class (`"flex flex-wrap gap-2"`,
which does nothing on a text input) since that migration: no border, no
glass surface, no defined height, browser-default font. `.card-add-field
input` as a CSS selector has matched nothing since, making both
`components.css`'s and `form.css`'s rules for it dead code that nobody
noticed because dead CSS doesn't fail typecheck, lint, or the existing test
suite.

## Considered options

1. **Leave it** — the dialog still functions, just unstyled. Rejected: this
   is a visible, shipped regression on a form real users fill in, not a
   theoretical gap.
2. **Restore the original `.card-add-field input` CSS rule**, undoing the
   Tailwind migration for this one element. Rejected: reintroduces the same
   class-that-can-vanish-silently risk this whole migration exists to
   remove, and every other control on the site already has its own Tailwind
   copy of this exact recipe (see `FormField.tsx`'s `FormInput`).
3. **Write the recipe as a Tailwind className constant** on
   `CardAddDialog.tsx`, matching the pattern `FormInput` already
   established for the sibling recipe used by login/signup/settings forms.

## Decision

Option 3. `cardAddInputClassName` in `CardAddDialog.tsx` now carries the
full recipe as Tailwind utility/arbitrary-value classes: `h-[var(--control-h)]`,
glass border/background/backdrop-blur/shadow, `rounded-pill`, the control
font stack, `placeholder:text-label-tertiary`,
`dark:border-[var(--glass-border-control)]`,
`hover:[box-shadow:var(--shadow-elevated)]`, and
`focus-visible:[border-color:var(--color-border-active)]`. Removed
`.card-add-field input` from every grouped selector in `components.css`, and
deleted `form.css` entirely — after this fix it held only the same two
now-migrated rules and nothing else.

## Consequences

- Good, because the Add Card dialog's inputs are visually correct again,
  matching every other control on the site.
- Good, because `form.css` (previously described as a "do not delete until
  cards.css moves `.card-add-field` to Tailwind" holding file) is now
  actually gone — the condition it was waiting on had already silently
  happened, incorrectly, without the file being cleaned up.
- Bad, because this regression shipped and sat unnoticed through this
  session's own `build-quality` pass on the `cards.css` chunk — visual
  review exercised the pages reachable without seeded data (landing,
  toolbar, sheets) but never opened the Add Card dialog itself, which
  needs an authenticated session. Worth naming as a gap in this session's
  verification coverage, not just in the code.

## Confirmation

`npm run check` green. Code-level confirmation: `grep -rn "card-add-field"
app/` now returns only historical comments, no live selectors or
classNames. `cardAddInputClassName`'s properties were checked line-for-line
against the pre-migration `components.css`/`cards.css`/`form.css` (via `git
show` on the commit before this migration branch) to confirm nothing beyond
the glass-control recipe was missed.

## Related

- Related: ADR-0011 (documents `FormInput`'s equivalent recipe for the
  sibling form-field family), ADR-0018 (the "missed secondary consumers"
  pattern — this is a variant of that same failure mode, a consumer that
  lost its styling entirely rather than one that kept reading deleted CSS)
- Code: `app/components/CardAddDialog.tsx`, `app/styles/components.css`
