---
id: ADR-0054
title: Untitled UI is vendored at the root and keeps Card Orb's look via its primitive palette
status: accepted
date: 2026-08-19
scope: repo
deciders: [Bart]
superseded-by: null
tags: [ui, design-system, untitled-ui, tailwind, tokens]
---

# Untitled UI is vendored at the root, and keeps Card Orb's look by re-pointing its primitive palette

This is the groundwork record. It settles *how* Untitled UI is wired in. It does
**not** claim any screen has been converted — at the time of writing exactly one
component (`base/buttons/button`) is on disk and nothing imports it.

## Context and problem statement

v0.11.0 of the shared standards added a rule: search Untitled UI (MCP) before
hand-writing a React or Tailwind component. Asked what "apply it" should mean
here, the answer was: replace everything, **keeping the Card Orb look** — glass,
the orb, the holographic cards — and prove it on one screen first.

Two things had to be decided before a single component could land.

## Decision 1 — the components live at the repository root, not in `app/components/`

`npx untitledui add button` writes to `components/base/…` and `utils/`, resolved
through the existing `@/*` → `./*` path alias. That layout is kept.

- Every future `untitledui add` lands in the same place with no argument and no
  post-move, so the vendored tree stays a faithful copy of upstream.
- `app/components/` stays what it has always been: Card Orb's own components.
  The boundary between "ours" and "theirs" is a directory rather than a naming
  convention nobody will remember.

## Decision 2 — keep the Card Orb look by re-pointing the *primitive* palette

Untitled UI's theme (`styles/theme.css` upstream, 834 lines, 697 variables) is
two layers, and that is what makes this cheap:

```
--color-text-primary:   var(--color-neutral-900);   /* semantic  */
--color-border-primary: var(--color-neutral-300);
--color-bg-primary:     var(--color-white);
```

The ~120 semantic variables are all expressed in terms of a small primitive
palette (`--color-neutral-*`, `--color-brand-*`, `--color-error-*`, …). So
Card Orb's look is reached by rewriting the **primitives**, roughly forty values,
and leaving the semantic layer untouched.

Rejected: rewriting the semantic layer to point at `--color-label`,
`--color-glass` and friends directly. It is around 120 hand-written bindings
instead of forty, it has to be redone every time upstream adds a semantic name,
and it silently breaks any component that reads a name nobody thought to bind.

## Decision 3 — the primitives are generated, not hand-written

`app/styles/tailwind.generated.css` is both Tailwind's entry point and the
`@theme` block, generated from `lib/design/tokens.ts` by
`scripts/gen-tokens.mjs`, and `verify.sh` fails on a hand edit. Untitled UI's
installer wants to own that same file.

The generator wins. Untitled UI's primitives will be emitted from
`lib/design/tokens.ts` like everything else. `gen-tokens.mjs`'s own header
explains why the direction has to be TypeScript → CSS: three consumers are not
CSS at all (`manifest.ts`, `layout.tsx`'s `themeColor`, both OG images), they
kept their own copies once, and one of the copies was wrong.

## Consequences

- **Two vendored edits were needed to get `verify.sh` to exit 0, and
  `untitledui add` will write both back.** In `components/base/buttons/button.tsx`
  the generator emits a default `React` import that nothing uses, which fails
  `tsc --noEmit` under the modern JSX transform. In `utils/is-react-component.ts`
  it emits an `eslint-disable @typescript-eslint/no-explicit-any` for a rule this
  project does not enable, so the directive is itself a warning and
  `--max-warnings 0` fails on it. Both are marked with a comment pointing here.
  **Re-run the two fixes after every `untitledui add`.**
- **The open hazard, and it is the one to be careful about.** Untitled UI's dark
  mode is a `.dark-mode` class inside `@layer base`. This app's is
  `[data-theme="dark"]` plus `light-dark()`, at zero specificity, deliberately
  (see the `@custom-variant` comment in the generated CSS). Bridging those two is
  a **cascade-layers** problem, which is exactly the shape of ADR-0012 — where
  every Tailwind margin added during the migration silently lost to legacy CSS
  and the screenshots looked fine because `gap` was unaffected. Nothing here has
  been proven on screen yet.
- Three runtime dependencies are now in `package.json`: `react-aria-components`,
  `tailwind-merge`, and (when an icon is first used) `@untitledui/icons`. The
  app keeps `lucide-react`; nothing has been swapped.
- `verify.sh` exits 0 with the vendored component present and unused.

## Why one screen first, and why `/login`

`app/components/controlClasses.ts` already records what a sweep costs here: an
attempt to convert all six control consumers and every raw `.btn` across
twenty-five files in one commit was refused by the screenshot harness at
152,025 differing pixels, and because everything moved at once there was no way
to attribute it. It was reverted whole. Four ADRs (0012, 0017, 0018, 0020)
describe this same migration breaking in ways tests, typecheck and lint all pass
through.

`/login` is the proof screen because it is **public**. ADR-0020 is a regression
found late precisely because the route needed a signed-in session to look at;
a proof nobody can photograph is not a proof.

## Confirmation

`./scripts/verify.sh` exits 0 on Node v24.19.0 with the vendored component in
place. The visual harness (`npm run visual:baseline`, then `npm run visual`) is
the check that matters for the conversion itself, and has **not** been run yet —
there is nothing converted to compare.
