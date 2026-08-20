---
id: ADR-0057
title: Card Orb's radius scale moves out of Tailwind's names, because @theme replaces rather than extends
status: accepted
date: 2026-08-19
scope: repo
deciders: [Bart]
superseded-by: null
tags: [tailwind, tokens, untitled-ui, radius, cascade]
---

# Card Orb's radius scale moves out of Tailwind's names

`--radius-xs`/`sm`/`md`/`lg` are now `--radius-orb-xs`/`orb-sm`/`orb-md`/`orb-lg`,
so the utilities are `rounded-orb-lg` and friends. `btn` and `pill` are
unchanged. Found by the `/login` proof screen, which is what a proof screen is
for.

## Context and problem statement

Tailwind v4's `@theme` **replaces** a scale rather than extending it. Card Orb
declared `--radius-lg: 24px`, so `rounded-lg` meant 24px — everywhere, including
inside components this project did not write.

Nobody noticed for as long as this project wrote all its own components. Untitled
UI's button and input both say `rounded-lg`, meaning Tailwind's 8px. They
rendered at 24px: fully pill-shaped inputs on the first converted screen.

Nothing failed. Not `tsc`, not eslint, not the 478 tests, not the build. The only
signal was a screenshot that looked *plausible* — the pills were not ugly, they
simply were not what upstream drew, and had the proof screen not been
photographed the whole library would have quietly inherited a radius scale
nobody chose.

This is the same failure as ADR-0012 and ADR-0017: **a shared name resolving to
somebody else's value, invisible to every check the project runs.** The third
instance, and the first where the collision came from outside the repository.

## Decision

Rename the four scale steps whose names are Tailwind's, and leave the two that
are not.

| Was | Now | Why |
|---|---|---|
| `--radius-xs` … `--radius-lg` | `--radius-orb-xs` … `--radius-orb-lg` | These are Tailwind's names. `@theme` replaces, so ours silently won. |
| `--radius-btn`, `--radius-pill` | unchanged | Not Tailwind's names; they never collided. |

ADR-0056 decides the direction: Untitled UI's value is the default, so
`rounded-lg` goes back to meaning Tailwind's 8px and Card Orb's scale is what
moves. `orb-` is unmistakably this project's and cannot collide with anything
upstream adds later.

## Alternatives considered

- **Leave it, and let Untitled UI wear Card Orb's radii.** Cheapest, and the
  screenshot honestly looked fine. Rejected on two counts: it contradicts
  ADR-0056, and — the real objection — it is an *accident* rather than a choice.
  A design system inherited by name collision cannot be reasoned about, and the
  next collision would be invisible in the same way.
- **Override `--radius-lg` back to 8px and give Card Orb's 24px a new name
  only where it is used.** Same amount of editing, and it leaves the trap armed:
  the next Tailwind-named token this project declares collides again.
- **Scope Untitled UI's components under a wrapper class with their own radii.**
  Considered and dropped as a cascade problem invented to avoid a rename, in a
  repository with three records about cascade problems.

## Consequences

- 32 utility usages across 17 files, plus the hand-written stylesheets that read
  the same tokens via `var()`. Entirely mechanical.
- `lib/design/tokens.test.ts` now kebab-cases the key before looking it up, since
  `orbXs` has to be found as `--radius-orb-xs`. It read the keys literally
  before, which worked only because every key happened to be a single lowercase
  word.
- **The general rule this leaves behind: do not name a token what Tailwind names
  one, unless the intention really is to replace Tailwind's for the whole app,
  vendored code included.** Colour is the case to watch next — `--color-brand-*`
  is deliberately a replacement, and that one *is* the intention.

## Confirmation

The screenshot harness, baselines taken before the rename: nine screenshots
across `/user/:name`, `/` and `/app/ios` at three widths, all still identical
after 32 renames in 17 files. Only `/login` differs, which is the change being
made.

`./scripts/verify.sh` exits 0 on Node v24.19.0 — 478 tests in 41 files.

## Related

- ADR-0056 — decides that Untitled UI's value is the default.
- ADR-0012, ADR-0017 — the same silent-collision shape, twice, from inside.
- ADR-0055 — the groundwork, and where the proof screen was chosen.
