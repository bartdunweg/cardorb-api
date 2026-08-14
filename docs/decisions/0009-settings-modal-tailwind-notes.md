---
id: ADR-0009
title: Danger colour token, and keeping modal.css's class names as cross-file hooks
status: accepted
date: 2026-08-14
scope: repo
deciders: [Bart]
superseded-by: null
tags: [css, tailwind]
---

# Danger colour token, and keeping modal.css's class names as cross-file hooks

## Context and problem statement

Continuing the Tailwind migration (ADR-0013, ADR-0007) with
`app/styles/settings.css` and `app/styles/modal.css`. Two things came up that
needed a decision rather than a mechanical port:

1. `settings.css`'s `.settings-panel--danger`/`.btn--danger` used a literal
   `#d7263d`, with a comment arguing it should stay a literal because it is
   "the only place in the app that uses a warning colour" and not worth a
   token "nothing else would use". Moving it into a shared React component
   (`SettingsPanel.tsx`, matching ADR-0007's pattern) put that literal in a
   `.tsx` file for the first time, which `lib/design/sources.test.ts` — a
   test neither ADR-0013 nor ADR-0007 had reason to look at — forbids: it
   scans every `.ts`/`.tsx` file for raw hex colours and fails unless the
   value lives in `lib/design/tokens.ts`.
2. `app/styles/cards.css` (not yet migrated, a much later chunk) has
   descendant selectors keyed to modal.css's class names —
   `.modal--card .modal-scroll`, `.modal--sheet .modal-close`, and the
   `modal--card`/`modal--card-add`/`modal--sheet` variant classes themselves
   assume `.modal`/`.modal-scroll`/`.modal-close` exist to scope under.
   Deleting those class names from `Modal.tsx` while porting modal.css's own
   rules to Tailwind would silently break every dialog's cards.css styling
   until cards.css is migrated too.

## Considered options

For (1):
1. **Keep the literal, silence or special-case the test.** Rejected —
   weakens a guard that exists for a real, previously-shipped bug (see
   `sources.test.ts`'s own history: the OG images shipped a rejected contrast
   value because it was written down twice).
2. **Add `danger` to `lib/design/tokens.ts`'s `colour` object**, generate it
   into `@theme` alongside the rest, reference it as `bg-danger`/
   `text-danger` and via `var(--color-danger)` in the one arbitrary
   `color-mix()` call that still needs the raw variable.

For (2):
1. **Delete the modal-specific class names along with modal.css**, since the
   file itself is gone. Rejected — breaks cards.css's dialog sizing/scroll
   rules with no compile-time signal that anything went wrong (CSS descendant
   selectors that stop matching don't error, they just stop applying).
2. **Keep `modal`, `modal-scroll`, `modal-close` as plain class names on the
   relevant elements, alongside the new Tailwind utility classes**, with a
   comment explaining they're now selector hooks, not style sources, and
   listing exactly which cards.css rules still need them.
3. Drop `modal-backdrop`/`modal-overlay`/`is-open`, which a repo-wide grep
   confirmed nothing outside `Modal.tsx` itself ever referenced — the
   `.is-open`/`display:none` toggle was additionally dead code once `open`
   already gated the whole component's render (`if (!open) return null`).

## Decision

We will add `danger` to `lib/design/tokens.ts` (option 2 for (1)) — the
original "not worth a token" reasoning predates `sources.test.ts`'s
enforcement and no longer holds once a `.tsx` file needs the value.

We will keep `modal`/`modal-scroll`/`modal-close` as class names in
`Modal.tsx` (option 2 for (2)), and drop `modal-backdrop`/`modal-overlay`/
`is-open` (option 3), which nothing depends on.

While rewriting the backdrop-click handler, replaced a
`target.classList.contains("modal-overlay")` string check with
`target === overlayRef.current` — the ref already existed and is a more
direct match than re-deriving identity from a class name that no longer
needs to exist for styling purposes.

## Consequences

- Good, because dialogs (`PublicCardDialog`, `CardAddDialog`, `FilterSheet`,
  `ViewSheet`) keep working unchanged — none of their cards.css-driven sizing
  broke.
- Good, because the danger colour now has one home instead of a duplicate
  waiting to drift, consistent with every other colour in the app.
- Neutral, because `Modal.tsx` carries three "vestigial" class names for a
  while — a future reader needs the comment above them to know they're not
  dead code to clean up.
- Bad, because this is one more piece of "don't delete this yet" state to
  track until the cards.css chunk lands and can finally remove them.

## Confirmation

`npm run typecheck`, `npm run test` (313 tests, including a new
`--radius-*`-style drift-guard pair for `danger` via the existing colour
pattern in `lib/design/tokens.test.ts`... actually covered transitively by
`sources.test.ts` passing) and `npm run lint` all pass. Grepped the repo for
`modal-backdrop`/`modal-overlay`/`is-open` to confirm nothing else read them
before removing.

## Related

- Supersedes: none
- Related: ADR-0013, ADR-0007
- Code: `app/components/SettingsPanel.tsx`, `app/components/Modal.tsx`,
  `lib/design/tokens.ts`, `lib/design/sources.test.ts`
