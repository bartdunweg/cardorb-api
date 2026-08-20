---
id: ADR-0061
title: Vendored Untitled UI code is exempt from this project's lint and type strictness
status: accepted
date: 2026-08-19
scope: repo
deciders: [Bart]
superseded-by: null
amends: ADR-0054, ADR-0057
tags: [untitled-ui, tooling, eslint, typescript, vendoring]
---

# Vendored Untitled UI code is exempt from this project's lint and type strictness

`components/`, `utils/` and `hooks/` are eslint-ignored, and every vendored
`.tsx` gets a `@ts-nocheck` re-applied by `scripts/untitled-add.mjs`.

## Context and problem statement

ADR-0054 recorded two edits the Untitled UI generator needed after every add.
ADR-0057 added a third, and said plainly:

> If that list grows much past three, the disagreement is with the library
> rather than the template, and that is worth reconsidering rather than
> automating further.

Installing the application shell — `sidebar-simple`, `metrics`, `empty-state`,
`section-headers`, `tabs`, `table` — produced exactly that. Not two more edits of
the same kind, but two new *kinds*:

- **`tsc --noEmit`** fails on `empty-state.tsx`, three times. This project sets
  `noUncheckedIndexedAccess: true`, so `sizes[i]` is `T | undefined` and the
  compiler makes you say so. Untitled UI is not written under that flag.
- **`eslint --max-warnings 0`** fails on `hooks/use-breakpoint.ts` — setState in
  an effect body — and warns on four components for using `<img>` where this
  project uses `next/image`.

Both are defensible in a library that cannot assume Next.js or one project's
compiler flags. Neither is a bug.

## Decision

**Stop patching files, and say who owns the code.**

- **Prettier**: the same three directories, in `.prettierignore`. Formatting them
  means every `ui:add` produces a diff that is half reformatting, which is how a
  real upstream change gets lost in the noise. This one was found the
  embarrassing way — by committing on a red gate and reading the log afterwards.
- **eslint**: `components/**`, `utils/**` and `hooks/**` are ignored, as a
  separate config block with the reasoning in it. Flat config does per-directory
  properly, so this is one edit that stays correct.
- **TypeScript**: has no per-directory options, so it has to be a per-file
  directive. `scripts/untitled-add.mjs` prepends
  `// @ts-nocheck — vendored, see ADR-0061` to every file under
  `components/{application,base,foundations}/`. **Before `"use client"`, not
  after** — `@ts-nocheck` only counts in a comment ahead of every statement, and
  a directive is a statement. A comment may precede a directive, so both apply.

The rules exist to keep *authored* code honest, and the authoring happens in
`app/` and `lib/`. Turning a rule off repository-wide because a dependency trips
it would be the actual mistake.

## What this gives up, stated rather than glossed

- **Type errors inside vendored components are now invisible.** If an upstream
  update ships something genuinely broken, `tsc` will not say so; the failure
  surfaces at runtime or in a screenshot. That is the real cost.
- What limits it: the components are used from `app/`, which is *not* exempt, so
  every prop this project passes is still checked against their exported types.
  `@ts-nocheck` silences the inside, not the boundary.
- `untitledButtonClasses.test.ts` still reads `button.tsx` as text and fails when
  it drifts, which is the one place a vendored file is asserted about at all.

## Alternatives considered

- **Keep patching per file.** Four kinds of patch and counting, each one a place
  the wrapper can silently stop matching after an upstream refactor. This is the
  option ADR-0057 told the next person to stop taking.
- **Relax the flags repository-wide.** `noUncheckedIndexedAccess` catches real
  bugs in code written here, and the React rule caught a real cascading render
  once. Losing them across `app/` and `lib/` to accommodate a dependency is a bad
  trade in the obvious direction.
- **Fork the components properly and own them.** That is what vendoring already
  is, and owning them means fixing them on every update by hand. The whole point
  of `ui:add` is that upstream can be taken wholesale.

## Consequences

- `scripts/untitled-add.mjs` now applies four patches. Three are template
  disagreements; the fourth is this. The file says which is which.
- **The PRO licence is passed on the command line.** `metrics`, `section-headers`
  and `table` are PRO, and `npx untitledui login` wants a browser a scripted run
  does not have. The MCP server hands the same key out with every component it
  describes, so `--license` takes it directly. `UNTITLED_UI_LICENSE` overrides.
- One component failing no longer skips the fixes for the ones that landed. That
  happened: the first shell install died on a PRO refusal and left the tree
  half-patched with a red typecheck nobody could place.

## Confirmation

`./scripts/verify.sh` exits 0 — 488 tests in 42 files, with ten of them still
asserting the vendored button recipe has not drifted.

## Related

- ADR-0054 — the first two patches.
- ADR-0057 — the third, and the warning this acts on.
