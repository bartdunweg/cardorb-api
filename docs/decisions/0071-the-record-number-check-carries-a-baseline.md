---
id: ADR-0071
title: The record-number check ships with a baseline of the collisions already here
status: accepted
date: 2026-08-21
scope: repo
deciders: [Claude, on /apply-standards]
superseded-by: null
tags: [tooling, memory-system, standards]
---

# The record-number check ships with a baseline of the collisions already here

## Context and problem statement

`/apply-standards` refreshed this repository against dev-standards v0.21.0 and
found `scripts/verify.sh` missing two checks the standard now carries. The skill
names both explicitly, because `verify.sh` has no generated region — nothing
copies them into an existing project, and both cover a failure that is silent by
nature:

- **`standards`** — is this project still on the current standard? Nothing else
  asks, and drift is invisible because every build check stays green.
- **`record numbers`** — did two parallel worktrees take the same record number?
  Both see the same directory, neither sees the other's uncommitted file, so both
  take the next free one. Git merges `0007-a.md` beside `0007-b.md` without
  complaint: different filenames, no conflict.

Adding the second one as written turns `verify.sh` permanently red. **Twelve
numbers are already doubled up** — eleven in `docs/decisions/`, one in
`docs/feedback/` — and `0030` is taken four times.

Every one is a real collision, found late and left on purpose. `STATE.md` and
`docs/README.md` both say so where they describe them: records are immutable, and
renumbering one means rewriting every cross-reference in the files pointing at
it. ADR-0054 is the exception that proves it — that one *was* renumbered, while
its branch was still open and before anything referred to it.

## Decision

**The check is added, with the twelve existing collisions listed as accepted.**
Anything not on the list fails.

    ACCEPTED_COLLISIONS="docs/decisions:0014 … docs/feedback:0007"

A check that fails forever on documented history teaches one lesson, which is to
stop reading the output. The case this check is actually for is the collision
created *today*, in the other worktree, which is still catchable — and that case
now fails loudly while the twelve stay quiet.

The comment at the list says the thing that keeps it honest: **adding a number
there is not a way to dismiss a fresh collision.** If yours is new, renumber it;
the other one is already on `main`.

Verified both ways rather than assumed: `verify.sh` passes with the twelve in
place, and a throwaway `0067-*.md` beside `0067-one-icon-set.md` made it fail
with the right message. The throwaway was deleted.

## The `standards` check exits 0 here, and its warnings are expected

It reports three, one each for `docs/decisions/`, `docs/feedback/` and
`docs/changelog.d/`: the standard keeps memory in `.dev-standards/` from v0.11.0,
and this repository deliberately keeps `docs/` (ADR-0053). They are warnings, not
failures, so the check passes.

`verify.sh` says at that block not to act on them and not to run
`migrate-memory.sh --apply`. Without that note the next reader gets an
instruction, from tooling, to undo a recorded decision.

## What else the refresh changed, and what it did not

- `CLAUDE.md` and `AGENTS.md` moved from v0.14.0 to v0.21.0. The **only**
  substantive edits are in `CLAUDE.md`: the changelog row is reworded to absorb
  the "no user-visible releases means neither file" note, and a new rule says to
  read `references/skill-routing.md` before choosing a skill, library or MCP.
  `AGENTS.md`'s body is byte-identical; only its marker moved. Both PRODUCT
  regions are untouched, and `CLAUDE.md` is 139 lines, inside the 150 ceiling.
- **Nothing was created that already existed.** `verify.sh` kept every one of its
  own commands — the template's only project check is `false`, and overwriting a
  working gate with it is the failure mode the skill warns about. `STATE.md`,
  the root `README.md`, `docs/README.md`, `CHANGELOG.md`, `changelog.d/` and
  `0000-adopt-memory-system.md` were all already here and were left alone.
- **No `.npmignore` was added.** The skill asks for one where a `package.json`
  could ship the memory to a registry; this manifest is `"private": true`, so
  `npm publish` refuses outright and the file would be ceremony.
- The installer had to be brought current first: it reported the local
  dev-standards checkout two commits behind, which mattered rather than being
  noise — those two commits *were* the v0.21.0 release, so the first comparison
  was against a stale v0.19.0 and found nothing to change.

## Consequences

- `verify.sh` grows two checks and stays green. It now fails on a new record
  collision, which it could not do before.
- The twelve accepted numbers are written down in a second place. If any is ever
  renumbered, this list has to be shortened with it — a small cost, and the
  alternative was a red gate.

## Alternatives considered

- **Add the check unmodified.** Honest and useless: red on every run, from the
  first, for history that will not be changed.
- **Renumber the twelve.** Rejected for the reason the records already give —
  they are immutable, cross-referenced from `STATE.md`, `docs/README.md` and each
  other, and several are cited by number in code comments.
- **Leave the check out.** What the repository already did, and the reason a
  collision has never once been caught by tooling here.
