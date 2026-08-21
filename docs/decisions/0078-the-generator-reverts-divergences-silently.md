---
id: ADR-0078
title: The Untitled UI generator reverts deliberate divergences silently, so the wrapper reports what it touched
status: accepted
date: 2026-08-21
scope: repo
deciders: [Claude, adopting command-menu-users]
superseded-by: null
tags: [untitled-ui, tooling, vendoring]
---

# The Untitled UI generator reverts deliberate divergences silently, so the wrapper reports what it touched

## Context and problem statement

Adopting the command menu (FB-0018 asked for a search that reads like Untitled
UI's; their `application/command-menus/` family is exactly that pattern) meant
running `npm run ui:add -- command-menu-users`. Thirty-three files, one new
dependency, `react-hotkeys-hook`.

**It also rewrote a file nobody asked it to, and the rewrite was a regression.**

`components/application/empty-state/empty-state.tsx` carries a deliberate,
measured trim: upstream it imports `@untitledui/file-icons` (2.5 MB on disk) and
the background-patterns barrel at the module's top level, which put 62 kB and
20.8 kB of gzipped SVG on the client for five "no cards yet" sentences. That was
cut, with the measurement written into the file. The generator considers
`empty-state` a dependency of the command menu, so it restored the upstream
version — imports and all — with no mention in its output.

Caught only because the diff was read. Nothing in the toolchain would have said
so: `verify.sh` passes, the trim is a comment plus two import lines, and a
reverted divergence looks identical to a legitimate upstream update.

**Two more faults came with the component itself**, continuing the pattern
ADR-0066 named — *vendored and unused is not a neutral state*:

- `parseHotkeys.ts` imports `Hotkey` and `KeyboardModifiers` from
  `react-hotkeys-hook/dist/types`. That is where they lived in v4. The CLI
  installed 5.3.3, whose files sit under `packages/react-hotkeys-hook/dist/` and
  which declares both types **without exporting them** — so no path, internal or
  public, reaches them. `tsc --noEmit` fails with TS2307 and the component is
  unbuildable exactly as shipped.
- The two faults the wrapper already knew about (`import React`, the stray
  `eslint-disable`) turned up again, as designed.

## Decision

**The wrapper reports every pre-existing file the generator rewrote, and refuses
to let that be silent.**

`scripts/untitled-add.mjs` snapshots `git diff --name-only` over `components/`
and `utils/` **before** the add, runs the add, then lists anything newly changed
that is not one of its own patches. The message says to read the diff and points
here.

It reports rather than repairs, and that is the decision. This script cannot know
which upstream differences are intentional — `empty-state`'s trim and a genuine
upstream bugfix are the same shape. Auto-restoring would be a guess in the
direction of "never take updates", which is worse than a prompt to look.

The before/after snapshot matters: comparing against the last commit flagged
work-in-progress as a generator rewrite, which is the kind of false positive that
teaches people to ignore the warning. **Proved both ways** — a no-op run reports
nothing, and re-running the add reports `empty-state.tsx` and nothing else.

**`parseHotkeys.ts` becomes patch 5**, declaring the two types locally. That file
is already a verbatim copy of the library's own source, so copying the two type
declarations it needs is the same kind of thing, and unlike a deeper internal
path it cannot break again when the package moves its files.

## Alternatives considered

- **Auto-restore anything already diverged.** Rejected above: it turns the
  vendored trees into a fork that can never take an update.
- **Pin `react-hotkeys-hook` to v4** so the generator's import path resolves.
  Rejected: pinning a transitive dependency backwards to accommodate a vendored
  file's import is a larger commitment than copying six lines of type
  declaration, and it would silently hold back a package this project does not
  otherwise care about.
- **Point the import at `react-hotkeys-hook/packages/react-hotkeys-hook/dist/index.d.ts`.**
  It resolves today. Rejected: the types are `declare type` without `export`, so
  it does not actually work, and reaching into a package's internal layout is
  what broke in the first place.
- **Leave the fifth patch out and fix it by hand each time.** ADR-0058 set three
  patches as the point to stop automating and reconsider, and ADR-0070 brought it
  back to three. This is now five. That ceiling was about *hand-written*
  divergence from upstream, and patches 1, 2 and 5 are not that — they are the
  generator emitting code that does not compile under this project's config or
  against the version it installed. Worth naming explicitly rather than
  quietly passing the number.

## Consequences

- `npm run ui:add` now prints a paragraph when the generator touches something
  that already existed. On a clean add of a component with no shared
  dependencies it prints nothing.
- **`empty-state.tsx` will be reverted again by any future add that names it a
  dependency.** The guard makes that visible; it does not prevent it. The
  restore is `git checkout -- components/application/empty-state/empty-state.tsx`.
- The vendored `command-menu-users.tsx` is a demo with eight hardcoded people in
  it. The reusable piece is `command-menu.tsx`. Until the add-card dialog is
  wired to it, this is a vendored component with no consumer — which ADR-0066
  says needs a consumer or a written reason. **The reason is that it is
  half-adopted, and this record is not that reason.** Wiring it is the next
  change.

## Related

- `docs/decisions/0066-a-panel-of-controls-is-not-a-menu.md` — "vendored and
  unused is not a neutral state", and the two crash-on-first-render faults that
  established it.
- `docs/decisions/0058-*`, `docs/decisions/0070-*` — the patch ceiling this
  passes, and why.
- `docs/feedback/0018-the-add-card-search-does-not-look-vendored.md` — what
  started this.
