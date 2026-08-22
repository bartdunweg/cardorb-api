---
id: ADR-0094
title: Only a token inside @theme becomes a utility, and nothing reports otherwise
status: accepted
date: 2026-08-22
scope: repo
deciders: [Bart]
superseded-by: null
tags: [css, tailwind, theme, silent-failure, shape, adr-0088]
---

# Only a token inside `@theme` becomes a utility, and nothing reports otherwise

The useful half of ADR-0093. That record says what the new structure is; this
one says what it cost to get there, and the two failures are the same shape.

## Context and problem statement

ADR-0093 deleted the token generator and rebuilt the styling on
`styles/theme.css`. Everything passed: Prettier, typecheck, 452 tests, lint,
`npm run build`, and a 491-token comparison across four theme states in a real
browser.

Then the app was loaded, and the buttons were square.

### Failure one: a whole design system left with the generator

ADR-0088's shape system — `shape-round` / `shape-rectangle` — was implemented as
`@utility` blocks that `scripts/gen-tokens.mjs` emitted. Deleting the generator
deleted them, along with `--radius-control`, `--radius-control-inner`, the five
`--control-px-*`, four `--blur-*` and `--color-glass-solid`.

**41 call sites referenced them.** Not one check noticed, because a class that
matches no rule is not an error in CSS, in TypeScript, or in ESLint. It is
simply a string in an attribute that does nothing.

### Failure two: the token was there, the class was not

With every token restored, the button still had square corners — and
`getComputedStyle` reported `--radius-control: 999px`, correctly, on the button
itself.

`--radius-control` had been restored into `:root` rather than into `@theme`.

**Only a token inside `@theme` generates a Tailwind utility.** A token in
`:root` is a perfectly good custom property that any CSS can read by name, and
`rounded-control` is not a class at all. The variable resolves; the rule that
would use it was never written.

This is the second time this project has met this exact rule — ADR-0054 states
it in a paragraph — and it still cost an hour, because the symptom points the
wrong way. A missing class looks like a broken *value*, and the value was fine.

## Decision

`--radius-control` is declared in `@theme`, where it generates the class. The
`shape-*` utilities override it per container, which works because Tailwind
emits `border-radius: var(--radius-control)` rather than inlining the value, so
a container rewriting the variable reaches every control inside it.

Values live in `theme.css`; the two shape utilities live in `globals.css`, which
is where Untitled UI keeps its own `@utility` blocks. The reasoning is written
beside the declaration, not only here — the next person to tidy a token into
`:root` will be reading `theme.css`, not `docs/decisions/`.

The four z-index call sites read `z-(--z-modal)` instead of a generated class.
Tailwind has no namespace that turns a z-index token into a utility, and four
call sites do not justify five `@utility` blocks against `globals.css`'s
200-line ceiling — which now stands at 198.

## Consequences

- A token that should be reachable as a class **must** be in `@theme`. A token
  only CSS reads by name may be in `:root`. Getting this backwards produces no
  error anywhere.
- The 1,353 lines of token tests deleted in ADR-0093 would not have caught
  either failure — they asserted on values, and both values were correct.
- **What would catch it: rendering the app.** Neither failure is visible in a
  build log, a test run, or a token-level comparison. Both are visible in one
  screenshot, to someone who knows what shape the button is meant to be.

## Alternatives considered

**Leave the shape system out and let the screens be fixed one by one.** Rejected.
Bart's instruction was that screens are his and structure is mine, and a design
system mechanism that 41 call sites reference is structure. Leaving it out would
have handed him 41 mysteries rather than a rebuild.

**Add `@utility` blocks for the z-index scale, as the old generator did.**
Rejected on the 200-line ceiling. `z-(--z-modal)` is Tailwind's own syntax for
exactly this and needs no generated class.

## Confirmation

`npm run check` exits 0. `npm run build` passes.

Neither of those is the evidence, and that is the point of this record. The
evidence is the landing page loaded at 1280×900 with the capsules back, and
`getComputedStyle` on the Sign up button reporting a `border-radius` that is no
longer `0px` while `--radius-control` reports what it always did.
